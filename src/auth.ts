/**
 * Keycloak Relay 客户端 — 浏览器侧 OAuth2 登录中转对接
 *
 * 配套服务: services/control_plane/keycloak_relay
 *
 * 用法:
 *   const auth = new RelayAuth({ relayBaseUrl: 'https://auth.audarai.com' });
 *
 *   // 启动时处理 callback (URL 上有 transfer_code 时自动消费, 写入存储)
 *   await auth.handleCallback();
 *
 *   if (!auth.isAuthenticated()) {
 *     auth.login();   // 跳到 relay -> Keycloak 登录页
 *     return;
 *   }
 *
 *   // 与 AudaraiClient 集成 (自动续期)
 *   const client = createAudaraiClient({
 *     baseUrl: 'https://api.audarai.com',
 *     accessToken: () => auth.getAccessToken(),
 *   });
 */

import { ApiError, AuthenticationError } from "./errors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenSet {
  access_token: string;
  id_token?: string | null;
  refresh_token?: string | null;
  token_type?: string;
  expires_in: number;
  refresh_expires_in?: number | null;
  scope?: string | null;
}

/** 持久化适配器, 默认使用 localStorage */
export interface AuthStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface RelayAuthConfig {
  /** relay 服务的对外地址, 例如 https://auth.audarai.com */
  relayBaseUrl: string;
  /** 持久化适配器, 默认 localStorage. SSR 环境请传内存实现. */
  storage?: AuthStorage;
  /** 存储 key 前缀, 默认 "audar_auth" */
  storageKey?: string;
  /** access_token 到期前多少秒主动 refresh, 默认 30 */
  refreshThresholdSeconds?: number;
  /** 自定义 fetch (Node 环境/测试) */
  fetch?: typeof globalThis.fetch;
  /**
   * 当 refresh_token 也失效, 无法静默续期时调用.
   * 默认行为: auth.login(currentUrl) 把用户推回登录.
   * 自行设置可以做"提示后再跳"等 UX.
   */
  onSessionExpired?: (auth: RelayAuth) => void | Promise<void>;
}

interface StoredTokens extends TokenSet {
  /** epoch ms, access_token 失效时间 */
  expires_at: number;
}

// ── Default storage ───────────────────────────────────────────────────────────

class LocalStorageAdapter implements AuthStorage {
  get(k: string): string | null {
    try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
  }
  set(k: string, v: string): void {
    try { globalThis.localStorage?.setItem(k, v); } catch { /* noop */ }
  }
  remove(k: string): void {
    try { globalThis.localStorage?.removeItem(k); } catch { /* noop */ }
  }
}

class MemoryStorage implements AuthStorage {
  private _kv = new Map<string, string>();
  get(k: string): string | null { return this._kv.get(k) ?? null; }
  set(k: string, v: string): void { this._kv.set(k, v); }
  remove(k: string): void { this._kv.delete(k); }
}

// ── ApiResponse helper ────────────────────────────────────────────────────────

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new ApiError(json.message ?? res.statusText, res.status, json.code ?? res.status);
  }
  return json.data as T;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class RelayAuth {
  private readonly _baseUrl: string;
  private readonly _storage: AuthStorage;
  private readonly _key: string;
  private readonly _threshold: number;
  private readonly _fetch: typeof globalThis.fetch;
  private readonly _onSessionExpired: (a: RelayAuth) => void | Promise<void>;
  private _refreshing: Promise<string> | null = null;

  constructor(config: RelayAuthConfig) {
    this._baseUrl = config.relayBaseUrl.replace(/\/$/, "");
    this._storage = config.storage
      ?? (typeof globalThis.localStorage !== "undefined" ? new LocalStorageAdapter() : new MemoryStorage());
    this._key = config.storageKey ?? "audar_auth";
    this._threshold = (config.refreshThresholdSeconds ?? 30) * 1000;
    this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
    this._onSessionExpired = config.onSessionExpired ?? ((a) => { a.login(); });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** 跳到 relay 的 /v1/auth/login, 由 relay 转发到 Keycloak. 不返回. */
  login(returnTo?: string): void {
    const target = returnTo ?? globalThis.location?.href;
    if (!target) throw new Error("login(): returnTo is required outside browser");
    const url = `${this._baseUrl}/v1/auth/login?return_to=${encodeURIComponent(target)}`;
    globalThis.location.assign(url);
  }

  /**
   * 在应用启动时调用. 如果当前 URL 含 ?transfer_code=xxx (relay 回调过来):
   *   - 用 transfer_code 调 /v1/auth/exchange 拿真 token
   *   - 写入存储
   *   - 从 URL 删掉 transfer_code 参数 (history.replaceState)
   *   - 返回 true
   * 否则返回 false. 多次调用安全.
   */
  async handleCallback(): Promise<boolean> {
    const loc = globalThis.location;
    if (!loc) return false;
    const url = new URL(loc.href);
    const code = url.searchParams.get("transfer_code");
    if (!code) return false;

    try {
      const tokens = await this._exchange(code);
      this._persist(tokens);
    } finally {
      // 不论成败都把 transfer_code 从 URL 上抹掉, 避免刷新重放
      url.searchParams.delete("transfer_code");
      globalThis.history?.replaceState({}, "", url.toString());
    }
    return true;
  }

  /** 当前是否有可用 (或可 refresh) 的 token */
  isAuthenticated(): boolean {
    const t = this._read();
    if (!t) return false;
    // 还没到期 OR 有 refresh_token 可以续
    return t.expires_at - Date.now() > 0 || !!t.refresh_token;
  }

  /**
   * 取一个有效的 access_token. 自动续期, 续期失败抛 AuthenticationError 并触发 onSessionExpired.
   * 这个就是给 createAudaraiClient({ accessToken: () => auth.getAccessToken() }) 用的.
   */
  async getAccessToken(): Promise<string> {
    const t = this._read();
    if (!t) {
      await this._onSessionExpired(this);
      throw new AuthenticationError("not logged in");
    }
    if (t.expires_at - Date.now() > this._threshold) {
      return t.access_token;
    }
    // 互斥: 多个并发请求只触发一次 refresh
    if (!this._refreshing) {
      this._refreshing = this._doRefresh().finally(() => { this._refreshing = null; });
    }
    return this._refreshing;
  }

  /** 当前 id_token (可解码读 sub/email/preferred_username 等). 不刷新. */
  getIdToken(): string | null {
    return this._read()?.id_token ?? null;
  }

  /**
   * 解码 id_token payload (不验签, 仅供 UI 展示用户名/头像).
   * 服务端会验签, 不要拿这个做权限判定.
   */
  getProfile(): Record<string, unknown> | null {
    const idt = this.getIdToken();
    if (!idt) return null;
    try {
      const payload = idt.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      return null;
    }
  }

  /** 清本地存储 + 跳到 relay /v1/auth/logout (它再跳 Keycloak end_session). */
  logout(returnTo?: string): void {
    const idHint = this.getIdToken();
    this._clear();
    const target = returnTo ?? globalThis.location?.origin ?? "";
    const params = new URLSearchParams({ return_to: target });
    if (idHint) params.set("id_token_hint", idHint);
    globalThis.location.assign(`${this._baseUrl}/v1/auth/logout?${params.toString()}`);
  }

  /** 仅清本地存储, 不跳转 (用于"切账号"或本地登出). */
  clearLocal(): void {
    this._clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _exchange(transferCode: string): Promise<TokenSet> {
    const res = await this._fetch(`${this._baseUrl}/v1/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_code: transferCode }),
    });
    return unwrap<TokenSet>(res);
  }

  private async _doRefresh(): Promise<string> {
    const t = this._read();
    if (!t?.refresh_token) {
      await this._onSessionExpired(this);
      throw new AuthenticationError("no refresh_token");
    }
    try {
      const res = await this._fetch(`${this._baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: t.refresh_token }),
      });
      const fresh = await unwrap<TokenSet>(res);
      this._persist(fresh);
      return fresh.access_token;
    } catch (e) {
      this._clear();
      await this._onSessionExpired(this);
      throw new AuthenticationError("refresh failed");
    }
  }

  private _read(): StoredTokens | null {
    const raw = this._storage.get(this._key);
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredTokens; } catch { return null; }
  }

  private _persist(t: TokenSet): void {
    const stored: StoredTokens = {
      ...t,
      expires_at: Date.now() + t.expires_in * 1000,
    };
    this._storage.set(this._key, JSON.stringify(stored));
  }

  private _clear(): void {
    this._storage.remove(this._key);
  }
}

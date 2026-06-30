import { AudaraiClientConfig, TokenData } from "./types";
import { ApiError, AuthenticationError, InsufficientBalanceError, RateLimitedError } from "./errors";

/** Options for session token exchange calls. */
export interface SessionTokenOptions {
  ttl?: number;
  one_time?: boolean;
}

function parseJwtExp(jwt: string): number | null {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Base64-encode a UTF-8 string in both browser (btoa) and Node (Buffer) environments. */
function toBase64(s: string): string {
  if (typeof btoa === "function") return btoa(s);
  const B = (globalThis as { Buffer?: { from(d: string, enc: string): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(s, "utf-8").toString("base64");
  throw new Error("No base64 encoder available in this environment");
}

class TokenManager {
  private _token: string | null = null;
  private _expiresAt: number | null = null;
  private _refreshing: Promise<string> | null = null;
  private readonly _threshold: number;
  private readonly _provider: (() => Promise<TokenData>) | null;

  constructor(provider: (() => Promise<TokenData>) | null, thresholdSeconds: number) {
    this._provider = provider;
    this._threshold = thresholdSeconds * 1000;
  }

  /** Set a static token (no refresh). */
  setStatic(token: string): void {
    this._token = token;
    this._expiresAt = null; // never expires
  }

  /** Invalidate cached token (e.g. after a 401). */
  invalidate(): void {
    this._token = null;
    this._expiresAt = null;
  }

  /** Seed an initial token with known expiry (milliseconds epoch). */
  seed(token: string, expiresAt: number | null): void {
    this._token = token;
    this._expiresAt = expiresAt;
  }

  async getToken(): Promise<string> {
    if (this._token && this._provider) {
      const now = Date.now();
      const expiresAt = this._expiresAt ?? Infinity;
      if (expiresAt - now > this._threshold) {
        return this._token;
      }
    } else if (this._token && !this._provider) {
      // static token, always valid
      return this._token;
    }

    if (!this._provider) {
      throw new AuthenticationError("No token provider configured");
    }

    // Mutex: prevent concurrent refreshes
    if (this._refreshing) {
      return this._refreshing;
    }

    this._refreshing = this._refresh().finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  private async _refresh(): Promise<string> {
    if (!this._provider) throw new AuthenticationError("No token provider");
    const data = await this._provider();
    this._token = data.token;
    // Prefer explicit expires_at to avoid clock drift
    if (data.expires_at != null) {
      this._expiresAt = data.expires_at * 1000;
    } else {
      this._expiresAt = Date.now() + data.expires_in * 1000;
    }
    return this._token;
  }
}

export class HttpClient {
  private readonly _baseUrl: string;
  readonly _tokenManager: TokenManager;
  private readonly _wsTokenManager: TokenManager | null;
  private readonly _fetch: typeof globalThis.fetch;
  private readonly _onTokenRefresh: (() => Promise<string>) | null;
  private readonly _authScheme: string;

  constructor(
    baseUrl: string,
    tokenManager: TokenManager,
    fetchImpl: typeof globalThis.fetch,
    wsTokenManager?: TokenManager,
    onTokenRefresh?: () => Promise<string>,
    authScheme: string = "Bearer",
  ) {
    this._baseUrl = baseUrl.replace(/\/$/, "");
    this._tokenManager = tokenManager;
    this._wsTokenManager = wsTokenManager ?? null;
    this._fetch = fetchImpl;
    this._onTokenRefresh = onTokenRefresh ?? null;
    this._authScheme = authScheme;
  }

  getBaseUrl(): string {
    return this._baseUrl;
  }

  /** Get the current token for HTTP requests (fetches/refreshes if needed). */
  getToken(): Promise<string> {
    return this._tokenManager.getToken();
  }

  /** Returns session token for WebSocket. Falls back to getToken() for publishableKey mode. */
  getWebSocketToken(): Promise<string> {
    return this._wsTokenManager
      ? this._wsTokenManager.getToken()
      : this._tokenManager.getToken();
  }

  /**
   * Make an unauthenticated request (no Authorization header).
   * Used for public endpoints like guest login and official speakers.
   */
  async requestNoAuth<T = unknown>(
    method: string,
    path: string,
    options: {
      body?: BodyInit;
      headers?: Record<string, string>;
      query?: Record<string, string | number | boolean | undefined>;
      expectBinary?: boolean;
    } = {}
  ): Promise<T> {
    const url = this._buildUrl(path, options.query);
    const headers: Record<string, string> = { ...options.headers };
    const res = await this._fetch(url, { method, headers, body: options.body });
    return this._handleResponse<T>(res, options.expectBinary);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: {
      body?: BodyInit;
      headers?: Record<string, string>;
      query?: Record<string, string | number | boolean | undefined>;
      expectBinary?: boolean;
    } = {}
  ): Promise<T> {
    const token = await this._tokenManager.getToken();
    const url = this._buildUrl(path, options.query);

    const headers: Record<string, string> = {
      Authorization: `${this._authScheme} ${token}`,
      ...options.headers,
    };

    const res = await this._fetch(url, { method, headers, body: options.body });

    if (res.status === 401) {
      let retryToken: string;
      if (this._onTokenRefresh) {
        // Use dedicated refresh callback to obtain a new token
        const jwt = await this._onTokenRefresh();
        if (!jwt) throw new AuthenticationError("onTokenRefresh returned an empty string");
        const exp = parseJwtExp(jwt);
        this._tokenManager.seed(jwt, exp ? exp * 1000 : null);
        retryToken = jwt;
      } else {
        // Invalidate and re-fetch via existing provider
        this._tokenManager.invalidate();
        retryToken = await this._tokenManager.getToken();
      }
      headers.Authorization = `${this._authScheme} ${retryToken}`;
      const retryRes = await this._fetch(url, { method, headers, body: options.body });
      return this._handleResponse<T>(retryRes, options.expectBinary);
    }

    return this._handleResponse<T>(res, options.expectBinary);
  }

  private _buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(this._baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }

  private async _handleResponse<T>(res: Response, expectBinary?: boolean): Promise<T> {
    if (res.status === 401) {
      throw new AuthenticationError();
    }
    if (res.status === 402) {
      throw new InsufficientBalanceError();
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new RateLimitedError("Rate limit exceeded", retryAfter ? parseInt(retryAfter) : undefined);
    }

    if (expectBinary) {
      if (!res.ok) {
        const text = await res.text();
        throw new ApiError(text, res.status, res.status);
      }
      return res as unknown as T;
    }

    const json = await res.json();
    if (!res.ok || (json.code !== undefined && json.code !== 0)) {
      throw new ApiError(json.message ?? res.statusText, res.status, json.code ?? res.status);
    }
    return json.data as T;
  }
}

export class AudaraiClient {
  readonly http: HttpClient;
  private readonly _tokenManager: TokenManager;
  private readonly _livekitUrl?: string;
  private readonly _fetch: typeof globalThis.fetch;
  private _preconnected = false;

  /** Known LiveKit server URL for pre-connection optimization. */
  get livekitUrl(): string | undefined { return this._livekitUrl; }

  constructor(config: AudaraiClientConfig) {
    const threshold = config.refreshThresholdSeconds ?? 30;
    const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);

    // Exactly one auth mode must be configured (appSecret is a modifier of appId, not its own mode)
    const authModes = [
      config.publishableKey != null,
      config.accessToken != null,
      config.apiKey != null,
      config.appId != null,
      config.guestToken != null,
    ].filter(Boolean).length;
    if (authModes !== 1) {
      throw new AuthenticationError(
        "Exactly one authentication mode must be configured: publishableKey, accessToken, apiKey, appId, or guestToken."
      );
    }
    if (config.appSecret != null && config.appId == null) {
      throw new AuthenticationError("appSecret requires appId to be set.");
    }

    let tokenProvider: (() => Promise<TokenData>) | null = null;
    let wsTokenProvider: (() => Promise<TokenData>) | null = null;
    let authScheme = "Bearer";

    if (config.publishableKey) {
      const pk = config.publishableKey;
      const baseUrl = config.baseUrl.replace(/\/$/, "");
      tokenProvider = async () => {
        const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${pk}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 300 }),
        });
        const body = await res.json();
        if (body.code !== 0) {
          throw new AuthenticationError(body.message ?? "Failed to obtain session token");
        }
        return body.data as TokenData;
      };
    } else if (config.accessToken) {
      const accessTokenInput = config.accessToken;
      const baseUrl = config.baseUrl.replace(/\/$/, "");
      const getJwt = typeof accessTokenInput === "function"
        ? accessTokenInput
        : () => Promise.resolve(accessTokenInput as string);

      tokenProvider = async () => {
        const jwt = await getJwt();
        if (!jwt) throw new AuthenticationError("accessToken resolved to an empty string");
        const exp = parseJwtExp(jwt);
        return { token: jwt, expires_in: 3600, ...(exp != null ? { expires_at: exp } : {}) };
      };

      wsTokenProvider = async () => {
        const jwt = await getJwt();
        if (!jwt) throw new AuthenticationError("accessToken resolved to an empty string");
        const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 300 }),
        });
        const body = await res.json();
        if (body.code !== 0) {
          throw new AuthenticationError(body.message ?? "Failed to exchange access token for session token");
        }
        return body.data as TokenData;
      };
    } else if (config.apiKey) {
      const key = config.apiKey;
      const baseUrl = config.baseUrl.replace(/\/$/, "");

      tokenProvider = async () => ({ token: key, expires_in: 86400 });

      wsTokenProvider = async () => {
        const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 300 }),
        });
        const body = await res.json();
        if (body.code !== 0) {
          throw new AuthenticationError(body.message ?? "Failed to obtain session token");
        }
        return body.data as TokenData;
      };
    } else if (config.guestToken) {
      // Guest token (gst_ prefix) — low-privilege, static Bearer token.
      const gst = config.guestToken;
      const baseUrl = config.baseUrl.replace(/\/$/, "");
      tokenProvider = async () => ({ token: gst, expires_in: 86400 });
      wsTokenProvider = async () => {
        const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${gst}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 300 }),
        });
        const body = await res.json();
        if (body.code !== 0) {
          throw new AuthenticationError(body.message ?? "Failed to obtain session token");
        }
        return body.data as TokenData;
      };
    } else if (config.appId) {
      const appId = config.appId;
      const baseUrl = config.baseUrl.replace(/\/$/, "");
      if (config.appSecret) {
        // Backend: authenticate via HTTP Basic base64(appId:appSecret).
        // WebSocket exchanges the Basic credential for a session token (stk_).
        const basic = toBase64(`${appId}:${config.appSecret}`);
        authScheme = "Basic";
        tokenProvider = async () => ({ token: basic, expires_in: 86400 });
        wsTokenProvider = async () => {
          const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
            method: "POST",
            headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 300 }),
          });
          const body = await res.json();
          if (body.code !== 0) {
            throw new AuthenticationError(body.message ?? "Failed to obtain session token");
          }
          return body.data as TokenData;
        };
      } else {
        // Frontend: appid alone → short-lived session token (same flow as publishableKey).
        tokenProvider = async () => {
          const res = await fetchImpl(`${baseUrl}/v1/speech/session-tokens`, {
            method: "POST",
            headers: { Authorization: `Bearer ${appId}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 300 }),
          });
          const body = await res.json();
          if (body.code !== 0) {
            throw new AuthenticationError(body.message ?? "Failed to obtain session token");
          }
          return body.data as TokenData;
        };
      }
    }

    this._livekitUrl = config.livekitUrl;
    this._fetch = fetchImpl;
    this._tokenManager = new TokenManager(tokenProvider, threshold);

    const wsTokenManager = wsTokenProvider
      ? new TokenManager(wsTokenProvider, threshold)
      : undefined;

    this.http = new HttpClient(
      config.baseUrl,
      this._tokenManager,
      fetchImpl,
      wsTokenManager,
      config.onTokenRefresh,
      authScheme,
    );

    // Auto pre-warm DNS/TLS for LiveKit server
    if (this._livekitUrl) {
      this.preconnect();
    }
  }

  /**
   * Pre-warm DNS resolution and TLS handshake for the LiveKit server.
   * Called automatically when `livekitUrl` is configured.
   * Can also be called manually with a URL discovered at runtime
   * (e.g. from a `createVoiceSession` response).
   *
   * Uses `<link rel="preconnect">` for passive warming and a no-cors fetch
   * for active TCP+TLS establishment. No CORS errors in console.
   */
  preconnect(url?: string): void {
    const livekitUrl = url || this._livekitUrl;
    if (!livekitUrl) return;

    // Normalise wss:// → https:// to extract origin
    const httpUrl = livekitUrl
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://");
    let origin: string;
    try {
      origin = new URL(httpUrl).origin;
    } catch {
      return;
    }

    // 1. Inject <link rel="preconnect"> — passive DNS + TLS warming
    if (typeof document !== "undefined" && !document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }

    // 2. Active warming: no-cors fetch completes TCP + TLS without CORS errors
    if (!this._preconnected || url) {
      this._fetch(origin, { mode: "no-cors", method: "HEAD" }).catch(() => {});
      if (!url) this._preconnected = true;
    }
  }
}

<script setup lang="ts">
import { ref, computed, onMounted, shallowRef } from "vue";
import { useClient } from "../composables/useClient";
import { RelayAuth } from "@audarai/sdk";
import type { AudaraiClientConfig } from "@audarai/sdk";

const emit = defineEmits<{ connected: [] }>();

const { connect, connected } = useClient();

type AuthMode = "pk" | "accessToken" | "apiKey" | "appId" | "appIdSecret" | "relay";

const baseUrl      = ref("https://prod.audarai.com/apiv2");
const authMode     = ref<AuthMode>("pk");

const RELAY_URL_KEY = "demo_relay_base_url";

const cred         = ref("pk_IHDQAHeZxu6uJ66FkvVor2qGAU-1e8bMuUDZ7i0PIK4");
const appSecret    = ref("");   // 仅 appIdSecret(后端)模式使用
const refreshUrl   = ref("");
const livekitUrl   = ref("");
const relayBaseUrl = ref(localStorage.getItem(RELAY_URL_KEY) ?? "http://localhost:8010");
const loading      = ref(false);
const errMsg       = ref("");

// ── Relay auth state ───────────────────────────────────────────────────────
const relayAuth       = shallowRef<RelayAuth | null>(null);
const relayLoggedIn   = ref(false);
const relayProfile    = ref<Record<string, unknown> | null>(null);
const relayBusy       = ref(false);

function buildRelayAuth(url: string): RelayAuth {
  return new RelayAuth({
    relayBaseUrl: url,
    onSessionExpired: () => { /* manual login */ },
  });
}

function refreshRelayState() {
  const a = relayAuth.value;
  if (!a) {
    relayLoggedIn.value = false;
    relayProfile.value  = null;
    return;
  }
  relayLoggedIn.value = a.isAuthenticated();
  relayProfile.value  = relayLoggedIn.value ? a.getProfile() : null;
}

// On mount: if URL has ?transfer_code= (callback from relay), process it.
onMounted(async () => {
  const hasCode = new URL(location.href).searchParams.has("transfer_code");
  if (!hasCode) return;

  // Use persisted relay URL from before redirect
  const persisted = localStorage.getItem(RELAY_URL_KEY);
  if (!persisted) {
    errMsg.value = "Received transfer_code but relay URL not found";
    return;
  }
  relayBaseUrl.value = persisted;
  authMode.value    = "relay";

  try {
    const a = buildRelayAuth(persisted);
    const ok = await a.handleCallback();
    if (ok) {
      relayAuth.value = a;
      refreshRelayState();
    }
  } catch (err) {
    errMsg.value = err instanceof Error ? err.message : String(err);
  }
});

// React to auth-mode change: lazily restore an existing relay session (localStorage).
function onAuthModeChange() {
  if (authMode.value === "relay" && !relayAuth.value && relayBaseUrl.value.trim()) {
    relayAuth.value = buildRelayAuth(relayBaseUrl.value.trim());
    refreshRelayState();
  }
}

async function handleRelayLogin() {
  const url = relayBaseUrl.value.trim();
  if (!url) { errMsg.value = "Please fill in Relay Base URL"; return; }
  errMsg.value = "";
  localStorage.setItem(RELAY_URL_KEY, url);
  const a = buildRelayAuth(url);
  relayAuth.value = a;
  a.login();   // redirect
}

async function handleRelayLogout() {
  const a = relayAuth.value;
  if (!a) return;
  a.clearLocal();
  refreshRelayState();
}

async function handleFetchToken() {
  const a = relayAuth.value;
  if (!a) return;
  relayBusy.value = true;
  errMsg.value = "";
  try {
    const tok = await a.getAccessToken();
    alert(`Got access_token (length ${tok.length}), first 32 chars:\n${tok.slice(0, 32)}...`);
    refreshRelayState();
  } catch (err) {
    errMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    relayBusy.value = false;
  }
}

const credLabel = computed(() => ({
  pk:          "Publishable Key",
  accessToken: "Access Token (JWT)",
  apiKey:      "API Key",
  appId:       "App ID (appid)",
  appIdSecret: "App ID (appid)",
  relay:       "",
}[authMode.value]));

const credPlaceholder = computed(() => ({
  pk:          "pk_xxx",
  accessToken: "eyJ...",
  apiKey:      "ak_xxx",
  appId:       "appid_xxx",
  appIdSecret: "appid_xxx",
  relay:       "",
}[authMode.value]));

async function handleConnect() {
  if (!baseUrl.value.trim()) {
    errMsg.value = "Please fill in Base URL";
    return;
  }

  // relay mode uses RelayAuth.getAccessToken() as the token provider
  if (authMode.value === "relay") {
    const a = relayAuth.value;
    if (!a || !a.isAuthenticated()) {
      errMsg.value = "Please log in via Relay first";
      return;
    }
  } else if (!cred.value.trim()) {
    errMsg.value = "Please fill in the credential";
    return;
  } else if (authMode.value === "appIdSecret" && !appSecret.value.trim()) {
    errMsg.value = "Please fill in the App Secret";
    return;
  }

  errMsg.value = "";
  loading.value = true;

  try {
    let cfg: AudaraiClientConfig;
    const url = baseUrl.value.trim();
    const c = cred.value.trim();
    const lk = livekitUrl.value.trim() || undefined;

    if (authMode.value === "pk") {
      cfg = {baseUrl: url, publishableKey: c, livekitUrl: lk};
    } else if (authMode.value === "accessToken") {
      const rUrl = refreshUrl.value.trim();
      cfg = {
        baseUrl: url,
        accessToken: c,
        livekitUrl: lk,
        ...(rUrl ? {
          onTokenRefresh: async () => {
            const res = await fetch(rUrl, {method: "POST"});
            if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
            const body = await res.json();
            const token = body.access_token ?? body.token ?? body.data?.token;
            if (!token) throw new Error("Refresh response missing token field");
            return token;
          }
        } : {}),
      };
    } else if (authMode.value === "relay") {
      const a = relayAuth.value!;
      cfg = {
        baseUrl: url,
        livekitUrl: lk,
        accessToken: () => a.getAccessToken(),
      };
    } else if (authMode.value === "appId") {
      // 前端：仅 appid（浏览器安全，等价 publishable key）
      cfg = {baseUrl: url, appId: c, livekitUrl: lk};
    } else if (authMode.value === "appIdSecret") {
      // 后端：appid + secret（HTTP Basic base64(appid:secret)）
      cfg = {baseUrl: url, appId: c, appSecret: appSecret.value.trim(), livekitUrl: lk};
    } else {
      cfg = {baseUrl: url, apiKey: c, livekitUrl: lk};
    }

    await connect(cfg);
    emit("connected");
  } catch (err) {
    errMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="connect-panel">
    <div class="field">
      <label>Base URL</label>
      <input v-model="baseUrl" type="text" placeholder="http://localhost" :disabled="connected" />
    </div>

    <div class="field">
      <label>Auth Mode</label>
      <select v-model="authMode" :disabled="connected" @change="onAuthModeChange">
        <option value="pk">Publishable Key</option>
        <option value="accessToken">Access Token (JWT)</option>
        <option value="apiKey">API Key</option>
        <option value="appId">App — appid (frontend)</option>
        <option value="appIdSecret">App — appid + secret (backend)</option>
        <option value="relay">Relay (Keycloak OAuth2)</option>
      </select>
    </div>

    <!-- ── Non-relay credential input ── -->
    <div v-if="authMode !== 'relay'" class="field">
      <label>{{ credLabel }}</label>
      <input v-model="cred" type="text" :placeholder="credPlaceholder" :disabled="connected" />
    </div>

    <!-- ── App secret (backend mode only) ── -->
    <div v-if="authMode === 'appIdSecret'" class="field">
      <label>App Secret <span class="hint">(backend only — never expose in browser)</span></label>
      <input v-model="appSecret" type="password" placeholder="secret_xxx" :disabled="connected" />
    </div>

    <div v-if="authMode === 'accessToken'" class="field">
      <label>Token Refresh URL <span class="hint">(optional, auto-refresh on 401)</span></label>
      <input
        v-model="refreshUrl"
        type="text"
        placeholder="POST https://auth.example.com/token/refresh"
        :disabled="connected"
      />
    </div>

    <!-- ── Relay auth controls ── -->
    <template v-if="authMode === 'relay'">
      <div class="field">
        <label>Relay Base URL</label>
        <input
          v-model="relayBaseUrl"
          type="text"
          placeholder="https://auth.audarai.com"
          :disabled="connected || relayLoggedIn"
        />
      </div>

      <div v-if="relayLoggedIn" class="field">
        <label>Current User</label>
        <div class="relay-profile">
          <div><b>sub:</b> {{ relayProfile?.sub ?? "-" }}</div>
          <div><b>email:</b> {{ relayProfile?.email ?? "-" }}</div>
          <div><b>name:</b> {{ relayProfile?.preferred_username ?? relayProfile?.name ?? "-" }}</div>
        </div>
      </div>

      <div class="relay-actions">
        <button
          v-if="!relayLoggedIn"
          class="btn"
          :disabled="connected"
          @click="handleRelayLogin"
        >
          🔑 Log in via Relay
        </button>

        <template v-else>
          <button class="btn" :disabled="relayBusy" @click="handleFetchToken">
            {{ relayBusy ? "..." : "🔍 View access_token" }}
          </button>
          <button class="btn btn-danger" :disabled="connected" @click="handleRelayLogout">
            🚪 Local Logout
          </button>
        </template>
      </div>
    </template>

    <div class="field">
      <label>LiveKit URL <span class="hint">(optional, pre-connect to reduce voice latency)</span></label>
      <input
        v-model="livekitUrl"
        type="text"
        placeholder="wss://livekit.example.com"
        :disabled="connected"
      />
    </div>

    <p v-if="errMsg" class="connect-err">{{ errMsg }}</p>

    <button
      class="btn btn-primary w-full"
      :disabled="connected || loading || (authMode === 'relay' && !relayLoggedIn)"
      @click="handleConnect"
    >
      {{ loading ? "Connecting..." : connected ? "✓ Connected" : "Connect" }}
    </button>
  </div>
</template>

<style scoped>
.relay-profile {
  background: rgba(0,0,0,0.04);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}
.relay-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.btn-danger {
  background: #fee;
  color: #c33;
}
</style>

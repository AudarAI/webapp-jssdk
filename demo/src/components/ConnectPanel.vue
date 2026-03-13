<script setup lang="ts">
import { ref, computed } from "vue";
import { useClient } from "../composables/useClient";
import type { AiVoxClientConfig } from "@aivox/sdk";

const emit = defineEmits<{ connected: [] }>();

const { connect, connected } = useClient();

const baseUrl   = ref("http://localhost:8004");
const authMode  = ref<"apikey" | "pk" | "session">("pk");
const cred      = ref("pk_IHDQAHeZxu6uJ66FkvVor2qGAU-1e8bMuUDZ7i0PIK4");
const loading   = ref(false);
const errMsg    = ref("");

const credLabel = computed(() => ({
  apikey:  "API Key",
  pk:      "Publishable Key"
}[authMode.value]));

const credPlaceholder = computed(() => ({
  apikey:  "ak_xxx",
  pk:      "pk_xxx",
}[authMode.value]));

async function handleConnect() {
  if (!baseUrl.value.trim() || !cred.value.trim()) {
    errMsg.value = "请填写完整配置";
    return;
  }
  errMsg.value = "";
  loading.value = true;

  try {
    let cfg: AiVoxClientConfig;
    const url = baseUrl.value.trim();
    const c   = cred.value.trim();

    if (authMode.value === "session") {
      cfg = { baseUrl: url, sessionToken: c };
    } else if (authMode.value === "pk") {
      cfg = { baseUrl: url, publishableKey: c };
    } else {
      cfg = {
        baseUrl: url,
        tokenProvider: async () => {
          const res = await fetch(`${url}/v1/speech/session-tokens`, {
            method:  "POST",
            headers: { Authorization: `Bearer ${c}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ ttl: 300 }),
          });
          const body = await res.json();
          if (body.code !== 0) throw new Error(body.message ?? "获取 session token 失败");
          return body.data;
        },
      };
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
      <label>认证模式</label>
      <select v-model="authMode" :disabled="connected">
        <option value="apikey">API Key → Session Token</option>
        <option value="pk">Publishable Key</option>
        <option value="session">Session Token</option>
      </select>
    </div>

    <div class="field">
      <label>{{ credLabel }}</label>
      <input v-model="cred" type="text" :placeholder="credPlaceholder" :disabled="connected" />
    </div>

    <p v-if="errMsg" class="connect-err">{{ errMsg }}</p>

    <button
      class="btn btn-primary w-full"
      :disabled="connected || loading"
      @click="handleConnect"
    >
      {{ loading ? "连接中..." : connected ? "✓ 已连接" : "连接" }}
    </button>
  </div>
</template>

import { ref, readonly } from "vue";
import { createAiVoxClient, type AiVoxClientConfig } from "@aivox/sdk";
import type { AiVoxClient, TtsApi, SttApi, TranslationApi } from "@aivox/sdk";

export type ConnectedClient = AiVoxClient & {
  tts: TtsApi;
  stt: SttApi;
  translation: TranslationApi;
};

// Module-level singleton — shared across all components
const _client = ref<ConnectedClient | null>(null);
const _connected = ref(false);

export function useClient() {
  async function connect(cfg: AiVoxClientConfig): Promise<void> {
    const c = createAiVoxClient(cfg) as ConnectedClient;
    // Probe connectivity
    await c.tts.listSpeakers();
    _client.value = c;
    _connected.value = true;
  }

  return {
    client: readonly(_client),
    connected: readonly(_connected),
    connect,
  };
}

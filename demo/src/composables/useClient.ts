import { shallowRef, ref, readonly, markRaw } from "vue";
import { createAudaraiClient, type AudaraiClientConfig } from "@audarai/sdk";
import type { AudaraiClient, TtsApi, SttApi, TranslationApi, AgentApi, KnowledgeApi, ToolApi, SkillApi, ArchetypeApi } from "@audarai/sdk";

export type ConnectedClient = AudaraiClient & {
  tts: TtsApi;
  stt: SttApi;
  translation: TranslationApi;
  agent: AgentApi;
  knowledge: KnowledgeApi;
  tool: ToolApi;
  skill: SkillApi;
  archetype: ArchetypeApi;
};

// Module-level singleton — shared across all components
const _client = shallowRef<ConnectedClient | null>(null);
const _connected = ref(false);

export function useClient() {
  async function connect(cfg: AudaraiClientConfig): Promise<void> {
    const c = createAudaraiClient(cfg) as ConnectedClient;
    // Probe connectivity
    await c.tts.listSpeakers();
    _client.value = markRaw(c);
    _connected.value = true;
  }

  return {
    client: readonly(_client),
    connected: readonly(_connected),
    connect,
  };
}

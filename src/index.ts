export { AiVoxClient } from "./client";
export { TtsApi } from "./tts";
export { SttApi, SttWebSocket } from "./stt";
export { TranslationApi, TranslationWebSocket } from "./translation";
export { AgentApi } from "./agent";
export { KnowledgeApi } from "./knowledge";
export { ToolApi } from "./tool";
export { SkillApi } from "./skill";
export { ArchetypeApi } from "./archetype";
export { RoomApi } from "./room";
export { SessionApi } from "./session";
export type { TranscribeResult } from "./stt";
export type { TranslationResult } from "./translation";
export type {
  AiVoxClientConfig,
  TokenData,
  Speaker,
  ListSpeakersResponse,
  SpeakerOperationResponse,
  WordTimestamp,
  SynthesizeOptions,
  TranscribeOptions,
  TranscribeStreamOptions,
  TranscribeStreamChunk,
  TranscribeStreamHandlers,
  ConnectSttWebSocketOptions,
  SttMessage,
  SttReadyMessage,
  SttPartialMessage,
  SttSegmentMessage,
  SttFinalMessage,
  SttErrorMessage,
  SttWebSocketHandlers,
  TranslateOptions,
  TranslateHandlers,
  ConnectTranslationWebSocketOptions,
  TranslationMessage,
  TranslationWebSocketHandlers,
  TranslationReadyMessage,
  TranslationSttPartialMessage,
  TranslationSttSegmentMessage,
  TranslationCompleteMessage,
  TranslationTtsChunkMessage,
  TranslationSegmentCompleteMessage,
  TranslationPipelineCompleteMessage,
  TranslationErrorMessage,
  TranslationSseStatusMessage,
  TranslationSseSttPartialMessage,
  TranslationSseSttFinalMessage,
  TranslationSseTranslationPartialMessage,
  TranslationSseTranslationCompleteMessage,
  TranslationSseTtsChunkMessage,
  TranslationSseTtsCompleteMessage,
  TranslationSsePipelineCompleteMessage,
  TranslationSseErrorMessage,
  MemoryPolicy,
  ToolBinding,
  AgentCreate,
  AgentUpdate,
  AgentResponse,
  AgentChatResponse,
  RoomCreate,
  RoomUpdate,
  RoomResponse,
  RoomAddAgent,
  RoomAgentListResponse,
  Participant,
  SessionCreate,
  SessionResponse,
  RoomSummary,
  SessionWithContextResponse,
  SessionListResponse,
  MessageCreate,
  MessageResponse,
  MessageListResponse,
  ReplyToMemberRequest,
  LiveKitTokenResponse,
  KnowledgeCreate,
  KnowledgeUpdate,
  KnowledgeResponse,
  KnowledgeDocumentResponse,
  IngestTextRequest,
  SearchRequest,
  SearchResultItem,
  ToolType,
  HttpToolConfig,
  BuiltinToolConfig,
  McpToolConfig,
  ToolConfig,
  ToolCreate,
  ToolUpdate,
  ToolResponse,
  BuiltinCatalogEntry,
  SkillCreate,
  SkillUpdate,
  SkillResponse,
  ArchetypeCreate,
  ArchetypeUpdate,
  ArchetypeResponse,
} from "./types";
export { AiVoxError, AuthenticationError, InsufficientBalanceError, RateLimitedError, ApiError } from "./errors";

import { AiVoxClient } from "./client";
import { TtsApi } from "./tts";
import { SttApi } from "./stt";
import { TranslationApi } from "./translation";
import { AgentApi } from "./agent";
import { KnowledgeApi } from "./knowledge";
import { ToolApi } from "./tool";
import { SkillApi } from "./skill";
import { ArchetypeApi } from "./archetype";
import { RoomApi } from "./room";
import { SessionApi } from "./session";
import type { AiVoxClientConfig } from "./types";

/**
 * Convenience factory that creates an AiVoxClient with TTS, STT, Translation, Agent and Knowledge APIs.
 *
 * @example
 * // Publishable key — all requests go through a session token
 * const client = createAiVoxClient({ baseUrl: 'https://api.aivox.com', publishableKey: 'pk_xxx' });
 *
 * @example
 * // SSO / OAuth2 access token (Keycloak JWT)
 * const client = createAiVoxClient({
 *   baseUrl: 'https://api.aivox.com',
 *   accessToken: async () => keycloakAdapter.token,
 * });
 *
 * @example
 * // API key
 * const client = createAiVoxClient({ baseUrl: 'https://api.aivox.com', apiKey: 'ak_xxx' });
 */
export function createAiVoxClient(config: AiVoxClientConfig): AiVoxClient & {
  tts: TtsApi;
  stt: SttApi;
  translation: TranslationApi;
  agent: AgentApi;
  knowledge: KnowledgeApi;
  tool: ToolApi;
  skill: SkillApi;
  archetype: ArchetypeApi;
} {
  const client = new AiVoxClient(config) as AiVoxClient & {
    tts: TtsApi;
    stt: SttApi;
    translation: TranslationApi;
    agent: AgentApi;
    knowledge: KnowledgeApi;
    tool: ToolApi;
    skill: SkillApi;
    archetype: ArchetypeApi;
  };
  client.tts = new TtsApi(client.http);
  client.stt = new SttApi(client.http);
  client.translation = new TranslationApi(client.http);
  client.agent = new AgentApi(client.http);
  client.knowledge = new KnowledgeApi(client.http);
  client.tool = new ToolApi(client.http);
  client.skill = new SkillApi(client.http);
  client.archetype = new ArchetypeApi(client.http);
  return client;
}

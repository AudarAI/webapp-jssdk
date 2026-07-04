export { AudaraiClient } from "./client";
export { RelayAuth } from "./auth";
export type { RelayAuthConfig, AuthStorage, TokenSet } from "./auth";
export { TtsApi } from "./tts";
export { SttApi, SttWebSocket } from "./stt";
export { LlmApi } from "./llm";
export { TranslationApi, TranslationWebSocket } from "./translation";
export { AgentApi } from "./agent";
export { KnowledgeApi } from "./knowledge";
export { ToolApi } from "./tool";
export { SkillApi } from "./skill";
export { ArchetypeApi } from "./archetype";
export { RoomApi } from "./room";
export { SessionApi } from "./session";
export { ChannelApi } from "./channel";
export type { TranscribeResult } from "./stt";
export type { TranslationResult } from "./translation";
export type {
  AudaraiClientConfig,
  TokenData,
  Speaker,
  VoiceMetadata,
  ListSpeakersResponse,
  SpeakerOperationResponse,
  ModelInfo,
  WordTimestamp,
  SpeakerTurn,
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
  SttSpeakerTurnMessage,
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
  MediaPolicy,
  TurnPolicy,
  MediaOverrides,
  RecordingInfo,
  ToolBinding,
  AgentCreate,
  AgentUpdate,
  AgentResponse,
  AgentChatResponse,
  AgentVoicesResponse,
  VoiceSessionRequest,
  VoiceSessionResponse,
  PhaseConfig,
  RoomCreate,
  RoomUpdate,
  RoomResponse,
  RoomAddAgent,
  RoomAgentListResponse,
  Participant,
  ParticipantInlineContext,
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
  AgentBinding,
  ChannelCreate,
  ChannelUpdate,
  ChannelResponse,
  ParticipantContextUpsert,
  ParticipantContextResponse,
  ParticipantContextPrivateResponse,
  SessionActionCreate,
  SessionActionResponse,
  ActionCountsResponse,
} from "./types";
export { AudaraiError, AuthenticationError, InsufficientBalanceError, RateLimitedError, ApiError } from "./errors";

import { AudaraiClient } from "./client";
import { TtsApi } from "./tts";
import { SttApi } from "./stt";
import { LlmApi } from "./llm";
import { TranslationApi } from "./translation";
import { AgentApi } from "./agent";
import { KnowledgeApi } from "./knowledge";
import { ToolApi } from "./tool";
import { SkillApi } from "./skill";
import { ArchetypeApi } from "./archetype";
import { RoomApi } from "./room";
import { SessionApi } from "./session";
import type { AudaraiClientConfig } from "./types";

/**
 * Convenience factory that creates an AudaraiClient with TTS, STT, Translation, Agent and Knowledge APIs.
 *
 * @example
 * // Publishable key — all requests go through a session token
 * const client = createAudaraiClient({ baseUrl: 'https://api.audarai.com', publishableKey: 'pk_xxx' });
 *
 * @example
 * // SSO / OAuth2 access token (Keycloak JWT)
 * const client = createAudaraiClient({
 *   baseUrl: 'https://api.audarai.com',
 *   accessToken: async () => keycloakAdapter.token,
 * });
 *
 * @example
 * // API key
 * const client = createAudaraiClient({ baseUrl: 'https://api.audarai.com', apiKey: 'ak_xxx' });
 */
export function createAudaraiClient(config: AudaraiClientConfig): AudaraiClient & {
  tts: TtsApi;
  stt: SttApi;
  llm: LlmApi;
  translation: TranslationApi;
  agent: AgentApi;
  knowledge: KnowledgeApi;
  tool: ToolApi;
  skill: SkillApi;
  archetype: ArchetypeApi;
} {
  const client = new AudaraiClient(config) as AudaraiClient & {
    tts: TtsApi;
    stt: SttApi;
    llm: LlmApi;
    translation: TranslationApi;
    agent: AgentApi;
    knowledge: KnowledgeApi;
    tool: ToolApi;
    skill: SkillApi;
    archetype: ArchetypeApi;
  };
  client.tts = new TtsApi(client.http);
  client.stt = new SttApi(client.http);
  client.llm = new LlmApi(client.http);
  client.translation = new TranslationApi(client.http);
  client.agent = new AgentApi(client.http);
  client.knowledge = new KnowledgeApi(client.http);
  client.tool = new ToolApi(client.http);
  client.skill = new SkillApi(client.http);
  client.archetype = new ArchetypeApi(client.http);
  return client;
}

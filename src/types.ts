export interface TokenData {
  token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AiVoxClientConfig {
  baseUrl: string;
  /**
   * Publishable key (pk_ prefix).
   * All requests (HTTP and WebSocket) use a short-lived session token (stk_)
   * automatically obtained from the publishable key.
   */
  publishableKey?: string;
  /**
   * SSO / OAuth2 access token (e.g. Keycloak JWT).
   * HTTP requests use the JWT directly as Bearer token.
   * WebSocket connections automatically exchange it for a session token (stk_).
   * Pass a static JWT string or an async function that returns a fresh JWT.
   */
  accessToken?: string | (() => Promise<string>);
  /**
   * Called when a 401 is received (or token nears expiry) to obtain a fresh access token.
   * Only applicable when `accessToken` is a static string.
   * Use this to implement Keycloak / OAuth2 token refresh logic.
   */
  onTokenRefresh?: () => Promise<string>;
  /**
   * API key (ak_ prefix).
   * HTTP requests use the key directly as Bearer token.
   * WebSocket connections automatically exchange it for a session token (stk_).
   */
  apiKey?: string;
  /** Seconds before expiry to proactively refresh. Default: 30 */
  refreshThresholdSeconds?: number;
  /** Custom fetch implementation (e.g. node-fetch in Node.js environments) */
  fetch?: typeof globalThis.fetch;
}

export interface Speaker {
  name: string;
  description?: string;
  reference_text?: string;
}

export interface ListSpeakersResponse {
  speakers: Speaker[];
  count?: number | null;
}

export interface SpeakerOperationResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface WordTimestamp {
  text: string;
  start_time: number;
  end_time: number;
}

export interface SynthesizeOptions {
  /** Speaker / voice profile name */
  voice?: string;
  /** TTS model: tts-1 | tts-1-hd. Default: tts-1 */
  model?: string;
  /** Output audio format. Default: mp3 */
  response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  /** Speech speed, range 0.25 ~ 4.0. Default: 1.0 */
  speed?: number;
  /** TTS provider: flash | turbo | pro */
  provider?: string;
}

export interface TranscribeOptions {
  language?: string;
  forced_alignment?: boolean;
  /** ASR provider: flash | turbo */
  provider?: string;
}

export interface TranscribeStreamOptions {
  language?: string;
  /** ASR provider: flash | turbo */
  provider?: string;
}

// ── STT SSE stream message types ─────────────────────────────────────────────

export interface TranscribeStreamChunk {
  text: string;
  language: string;
  is_final: boolean;
  chunk_index: number;
}

export interface TranscribeStreamHandlers {
  /** Called for every incremental chunk (including the final one). */
  onChunk?: (chunk: TranscribeStreamChunk) => void;
  /** Called once when `is_final` is true. */
  onFinal?: (chunk: TranscribeStreamChunk) => void;
  /** Called if the server sends an error event. */
  onError?: (error: Error) => void;
}

export interface ConnectSttWebSocketOptions {
  /** ASR provider: flash | turbo */
  provider?: string;
  language?: string;
}

// ── STT WebSocket message types ───────────────────────────────────────────────

export interface SttReadyMessage {
  type: "ready";
  session_id: string;
  language: string;
}

export interface SttPartialMessage {
  type: "partial";
  text: string;
  language: string;
  segment: number;
}

export interface SttSegmentMessage {
  type: "segment";
  segment_index: number;
  text: string;
  language: string;
  audio_duration: number;
  reason: string;
}

export interface SttFinalMessage {
  type: "final";
  text: string;
  language: string;
  duration: number;
}

export interface SttErrorMessage {
  type: "error";
  message: string;
}

export type SttMessage =
  | SttReadyMessage
  | SttPartialMessage
  | SttSegmentMessage
  | SttFinalMessage
  | SttErrorMessage;

export interface SttWebSocketHandlers {
  /** Called when the server is ready. The SDK automatically sends `start` after this. */
  onReady?: (msg: SttReadyMessage) => void;
  /** Called for each partial transcription result (~120ms throttle). */
  onPartial?: (msg: SttPartialMessage) => void;
  /** Called when a speech segment is finalized. */
  onSegment?: (msg: SttSegmentMessage) => void;
  /** Called when the session is fully complete. */
  onFinal?: (msg: SttFinalMessage) => void;
  /** Called on pipeline error. */
  onError?: (event: Event | SttErrorMessage) => void;
  /** Called when the WebSocket closes. */
  onClose?: (event: CloseEvent) => void;
}

// ── Translation SSE pipeline message types ────────────────────────────────────

export interface TranslationSseStatusMessage {
  type: "status";
  stage: string;
  message: string;
}

export interface TranslationSseSttPartialMessage {
  type: "stt_partial";
  text: string;
  language: string;
  chunk_index: number;
}

export interface TranslationSseSttFinalMessage {
  type: "stt_final";
  text: string;
  language: string;
  duration: number;
}

export interface TranslationSseTranslationPartialMessage {
  type: "translation_partial";
  text: string;
  target_lang: string;
}

export interface TranslationSseTranslationCompleteMessage {
  type: "translation_complete";
  text: string;
  source_lang: string;
  target_lang: string;
}

export interface TranslationSseTtsChunkMessage {
  type: "tts_chunk";
  /** Base64-encoded audio data. Decoded to ArrayBuffer in onTtsChunk. */
  audio: string;
  format: string;
  chunk_index: number;
  sample_rate: number;
}

export interface TranslationSseTtsCompleteMessage {
  type: "tts_complete";
  total_chunks: number;
}

export interface TranslationSsePipelineCompleteMessage {
  type: "pipeline_complete";
  source_text: string;
  translated_text: string;
}

export interface TranslationSseErrorMessage {
  type: "error";
  stage: string;
  message: string;
}

export interface TranslateHandlers {
  /** Pipeline stage status updates (stt / translation / tts). */
  onStatus?: (msg: TranslationSseStatusMessage) => void;
  /** Real-time partial ASR results during transcription. */
  onSttPartial?: (msg: TranslationSseSttPartialMessage) => void;
  /** Final ASR result for the whole audio. */
  onSttFinal?: (msg: TranslationSseSttFinalMessage) => void;
  /** Incremental translation tokens (LLM streaming). */
  onTranslationPartial?: (msg: TranslationSseTranslationPartialMessage) => void;
  /** Full translated text, ready. */
  onTranslationComplete?: (msg: TranslationSseTranslationCompleteMessage) => void;
  /** Called with decoded audio buffer (base64 already decoded). */
  onTtsChunk?: (audio: ArrayBuffer, meta: Omit<TranslationSseTtsChunkMessage, "type" | "audio">) => void;
  /** All TTS chunks delivered. */
  onTtsComplete?: (msg: TranslationSseTtsCompleteMessage) => void;
  /** Entire pipeline complete — contains both source and translated text. */
  onPipelineComplete?: (msg: TranslationSsePipelineCompleteMessage) => void;
  /** Called on any pipeline stage error. */
  onError?: (msg: TranslationSseErrorMessage) => void;
}

// ── Translation WebSocket message types ───────────────────────────────────────

export interface TranslationReadyMessage {
  type: "ready";
  session_id: string;
}

export interface TranslationSttPartialMessage {
  type: "stt_partial";
  text: string;
  language: string;
  segment: number;
}

export interface TranslationSttSegmentMessage {
  type: "stt_segment";
  text: string;
  language: string;
  segment_index: number;
}

export interface TranslationCompleteMessage {
  type: "translation_complete";
  text: string;
  source_lang: string;
  target_lang: string;
  segment_index: number;
}

export interface TranslationTtsChunkMessage {
  type: "tts_chunk";
  /** Base64-encoded audio data. Use `decodeAudio()` to get an ArrayBuffer. */
  audio: string;
  format: "pcm" | "wav" | "mp3";
  chunk_index: number;
  sample_rate: number;
  segment_index: number;
}

export interface TranslationSegmentCompleteMessage {
  type: "segment_complete";
  segment_index: number;
  source_text: string;
  translated_text: string;
}

export interface TranslationPipelineCompleteMessage {
  type: "pipeline_complete";
  duration: number;
}

export interface TranslationErrorMessage {
  type: "error";
  message: string;
  stage?: string;
  segment_index?: number;
}

export type TranslationMessage =
  | TranslationReadyMessage
  | TranslationSttPartialMessage
  | TranslationSttSegmentMessage
  | TranslationCompleteMessage
  | TranslationTtsChunkMessage
  | TranslationSegmentCompleteMessage
  | TranslationPipelineCompleteMessage
  | TranslationErrorMessage;

export interface TranslationWebSocketHandlers {
  onReady?: (msg: TranslationReadyMessage) => void;
  onSttPartial?: (msg: TranslationSttPartialMessage) => void;
  onSttSegment?: (msg: TranslationSttSegmentMessage) => void;
  onTranslationComplete?: (msg: TranslationCompleteMessage) => void;
  /** Called with decoded PCM/audio buffer (already base64-decoded). */
  onTtsChunk?: (audio: ArrayBuffer, meta: Omit<TranslationTtsChunkMessage, "type" | "audio">) => void;
  onSegmentComplete?: (msg: TranslationSegmentCompleteMessage) => void;
  onPipelineComplete?: (msg: TranslationPipelineCompleteMessage) => void;
  onError?: (msg: TranslationErrorMessage) => void;
  onClose?: (event: CloseEvent) => void;
}

export interface TranslateOptions {
  target_lang: string;
  source_lang?: string;
  voice?: string;
  /** Translation engine: "llm" (default) | "mt" */
  translation_mode?: "llm" | "mt";
  response_format?: "mp3" | "wav" | "opus" | "pcm";
  /** Whether to synthesize TTS audio. Server default: true */
  tts_enabled?: boolean;
}

export interface ConnectTranslationWebSocketOptions {
  target_lang: string;
  source_lang?: string;
  voice?: string;
  /** Translation engine: "llm" (default) | "mt" */
  translation_mode?: "llm" | "mt";
  tts_enabled?: boolean;
  response_format?: string;
}

// ── Agent types ───────────────────────────────────────────────────────────────

export interface MemoryPolicy {
  enable_memory?: boolean;
  num_history_turns?: number;
}

export interface ToolBinding {
  tool_id: string;
  [key: string]: unknown;
}

export interface AgentCreate {
  name: string;
  description?: string;
  archetype_id?: string;
  identity?: Record<string, unknown>;
  voice_id?: string;
  memory_policy?: MemoryPolicy;
  tool_bindings?: ToolBinding[];
  is_public?: boolean;
  is_platform?: boolean;
  system_prompt?: string;
  language?: string;
  role?: string;
  /** Skill UUIDs to bind to this agent. */
  skills?: string[];
  /** Knowledge UUIDs to bind to this agent. */
  knowledge_bindings?: string[];
  /** Channel UUIDs to bind to this agent. */
  channel_bindings?: string[];
}

export interface AgentUpdate {
  name?: string;
  description?: string;
  archetype_id?: string;
  identity?: Record<string, unknown>;
  voice_id?: string;
  memory_policy?: MemoryPolicy;
  tool_bindings?: ToolBinding[];
  is_public?: boolean;
  is_platform?: boolean;
  status?: string;
  system_prompt?: string;
  language?: string;
  role?: string;
  skills?: string[];
  knowledge_bindings?: string[];
  channel_bindings?: string[];
}

export interface AgentResponse {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  archetype_id: string | null;
  name: string;
  description: string;
  identity: Record<string, unknown>;
  voice_id: string | null;
  memory_policy: MemoryPolicy;
  tool_bindings: ToolBinding[];
  is_public: boolean;
  is_platform: boolean;
  status: string;
  system_prompt: string;
  language: string | null;
  role: string | null;
  skills: string[];
  knowledge_bindings: string[];
  channel_bindings: string[];
  created_at: string;
  updated_at: string;
}

export interface AgentChatResponse {
  session_id: string;
  room_id: string;
}

// ── Room types ────────────────────────────────────────────────────────────────

export interface RoomCreate {
  /** Room display name. */
  name: string;
  description?: string;
  /** "direct" (default) or custom type. */
  room_type?: string;
  /** System-level prompt injected into every session in this room. */
  room_prompt?: string;
  /** Knowledge IDs shared across all sessions. */
  shared_knowledge?: unknown[];
  policies?: Record<string, unknown>;
  config?: Record<string, unknown>;
  /** Agent UUIDs allowed in this room. */
  agent_ids?: string[];
  /** Access control: "private" (default) | "shared" | "public" */
  visibility?: "private" | "shared" | "public";
  /** Conversation flow mode: "sequential" (default) | "moderator_led" | "freeform" */
  talking_style?: "sequential" | "moderator_led" | "freeform";
  /** Prompt rules used when talking_style is "freeform". */
  speaking_rules?: string;
  /** Skill UUIDs bound to this room. */
  skill_ids?: string[];
  /** Tool UUIDs bound to this room. */
  tool_ids?: string[];
}

export interface RoomUpdate {
  name?: string;
  description?: string;
  room_prompt?: string;
  shared_knowledge?: unknown[];
  policies?: Record<string, unknown>;
  config?: Record<string, unknown>;
  agent_ids?: string[];
  visibility?: "private" | "shared" | "public";
  talking_style?: "sequential" | "moderator_led" | "freeform";
  speaking_rules?: string;
  skill_ids?: string[];
  tool_ids?: string[];
}

export interface RoomResponse {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  room_type: string;
  room_prompt: string;
  shared_knowledge: unknown[];
  policies: Record<string, unknown>;
  config: Record<string, unknown>;
  agent_ids: string[];
  visibility: string;
  talking_style: string;
  speaking_rules: string;
  skill_ids: string[];
  tool_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RoomAddAgent {
  agent_id: string;
}

export interface RoomAgentListResponse {
  room_id: string;
  agent_ids: string[];
}


// ── Session types ─────────────────────────────────────────────────────────────

export interface Participant {
  /** "user" | "agent" | custom type */
  type: string;
  /** UUID of the user or agent */
  ref_id: string;
  /** Display name of the participant, if returned by the server */
  name?: string;
  [key: string]: unknown;
}

export interface SessionCreate {
  /** Optional voice_id to override the agent's default voice for this session. */
  voice_id?: string;
  config?: Record<string, unknown>;
  participants?: Participant[];
}

export interface LiveKitTokenRequest {
  /** 三方终端用户ID，用作 LiveKit participant identity */
  user_id?: string;
  /** 终端用户显示名，用作 LiveKit participant name */
  user_name?: string;
}

export interface SessionResponse {
  id: string;
  room_id: string;
  tenant_id: string;
  user_id: string | null;
  status: string;
  participants: Participant[];
  config_snapshot: Record<string, unknown>;
  metrics: Record<string, unknown>;
  error_context: Record<string, unknown>;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  room_type: string;
  visibility: string;
  talking_style: string;
}

export interface SessionWithContextResponse extends SessionResponse {
  room: RoomSummary | null;
  /** Agent UUIDs extracted from session participants. */
  agent_ids: string[];
}

export interface SessionListResponse {
  data: SessionWithContextResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ── Message types ─────────────────────────────────────────────────────────────

export interface MessageCreate {
  role?: string;
  content: string;
  speaker_type?: string;
  speaker_ref_id?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageResponse {
  id: string;
  session_id: string;
  seq_num: number;
  role: string;
  speaker_type: string;
  speaker_ref_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MessageListResponse {
  data: MessageResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ── Knowledge types ───────────────────────────────────────────────────────────

export interface KnowledgeCreate {
  name: string;
  description?: string;
  source_uri?: string;
  collection?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeUpdate {
  name?: string;
  description?: string;
  source_uri?: string;
  collection?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeResponse {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  description: string;
  source_uri: string;
  collection: string;
  embedding_status: "pending" | "processing" | "completed" | "failed";
  embedding_model: string;
  total_chunks: number;
  processed_chunks: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocumentResponse {
  id: string;
  knowledge_id: string;
  tenant_id: string;
  chunk_index: number;
  source_label: string;
  content: string;
  created_at: string;
}

export interface IngestTextRequest {
  source_type: "text" | "url";
  /** Required when source_type is "text". */
  text?: string;
  /** Required when source_type is "url". */
  url?: string;
  /** Human-readable label stored on every chunk. Defaults to "inline text" or the URL. */
  source_label?: string;
  /** BCP-47 language code for sentence segmentation. Default: "en". */
  language?: string;
}

export interface SearchRequest {
  query: string;
  /** Number of results to return. Default: 5. */
  top_k?: number;
  language?: string;
}

export interface SearchResultItem {
  id: string;
  chunk_index: number;
  source_label: string;
  content: string;
  /** Cosine similarity in [0, 1]. Higher is more relevant. */
  score: number;
  created_at: string;
}

// ── Tool types ────────────────────────────────────────────────────────────────

export type ToolType = "http" | "builtin" | "mcp";

export interface HttpToolConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body_schema?: Record<string, unknown>;
  timeout?: number;
}

export interface BuiltinToolConfig {
  toolkit: string;
  params?: Record<string, unknown>;
  include_tools?: string[];
  exclude_tools?: string[];
}

export interface McpToolConfig {
  transport: "sse" | "stdio";
  server_url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export type ToolConfig = HttpToolConfig | BuiltinToolConfig | McpToolConfig;

export interface ToolCreate {
  name: string;
  description?: string;
  tool_type: ToolType;
  config: ToolConfig;
  auth_ref?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  is_public?: boolean;
}

export interface ToolUpdate {
  name?: string;
  description?: string;
  tool_type?: ToolType;
  config?: ToolConfig;
  auth_ref?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  is_public?: boolean;
  status?: string;
}

export interface ToolResponse {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string;
  tool_type: ToolType;
  config: Record<string, unknown>;
  auth_ref: Record<string, unknown>;
  policy: Record<string, unknown>;
  is_public: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BuiltinCatalogEntry {
  toolkit: string;
  description: string;
  auth_required: boolean;
  auth_fields: string[];
  options_schema: Record<string, unknown>;
}

// ── Skill types ───────────────────────────────────────────────────────────────

export interface SkillCreate {
  name: string;
  description?: string;
  /** Markdown content injected into the agent's system instructions. */
  content?: string;
  is_public?: boolean;
}

export interface SkillUpdate {
  name?: string;
  description?: string;
  content?: string;
  is_public?: boolean;
  status?: string;
}

export interface SkillResponse {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string;
  content: string;
  is_public: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

// ── Archetype types ───────────────────────────────────────────────────────────

export interface ArchetypeCreate {
  name: string;
  description?: string;
  base_prompt?: string;
  default_skills?: unknown[];
  default_channels?: unknown[];
}

export interface ArchetypeUpdate {
  name?: string;
  description?: string;
  base_prompt?: string;
  default_skills?: unknown[];
  default_channels?: unknown[];
}

export interface ArchetypeResponse {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string;
  base_prompt: string;
  default_skills: unknown[];
  default_channels: unknown[];
  created_at: string;
  updated_at: string;
}

// ── Voice types ───────────────────────────────────────────────────────────────

export interface LiveKitTokenResponse {
  token: string;
  room_name: string;
  livekit_url: string;
  session_id: string;
}

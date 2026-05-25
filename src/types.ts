export interface TokenData {
  token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AudaraiClientConfig {
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
  /**
   * Known LiveKit server URL for pre-connection optimization.
   * When provided, consumers can call `Room.prepareConnection(livekitUrl)` before
   * creating a voice session, eliminating DNS/TLS cold-start latency (~500-800ms).
   * The actual `livekit_url` returned per-session by the API takes precedence for `room.connect()`.
   *
   * @example "wss://livekit.example.com"
   */
  livekitUrl?: string;
}

export interface VoiceMetadata {
  gender?: string;
  language?: string;
  accent?: string;
  tone?: string;
  duration_s?: number;
  expression_tags?: string[];
  original_profile_id?: string;
  sample_file?: string;
  [key: string]: unknown;
}

export interface Speaker {
  name: string;
  description?: string;
  reference_text?: string;
  /** Codecs for which encoded reference frames are stored on the server. */
  available_codecs?: string[];
  /** Per-codec count of stored reference frames. */
  num_codes?: Record<string, number>;
  /** Free-form per-voice metadata (gender, language, expression_tags, ...). */
  metadata?: VoiceMetadata;
  /** TTS model names this voice may be selected with (model_management `name`). */
  compatible_models?: string[];
}

export interface ListSpeakersResponse {
  speakers: Speaker[];
  count?: number | null;
  details?: Record<string, unknown> | null;
}

export interface SpeakerOperationResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ModelInfo {
  /** Unique handle, e.g. "tts-flash" — pass as `provider` query param. */
  name: string;
  /** Human-friendly label for UI (e.g. "TTS Flash"). */
  display_name: string;
  /** Capability tag: "tts" | "stt" | "llm" | "mt" | ... */
  kind: string;
  /** True for the default row of this kind (used when caller omits `provider`). */
  is_default: boolean;
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
  /** Sampling temperature. Range: 0.0–2.0 */
  temperature?: number;
  /** Nucleus sampling probability. Range: 0.0–1.0 */
  top_p?: number;
  /** Top-K sampling. Range: 1–500 */
  top_k?: number;
  /** Random seed for reproducibility. */
  seed?: number;
  /** Minimum tokens to generate. Range: 1–1000 */
  min_tokens?: number;
  /** Maximum tokens to generate. Range: 100–8192 */
  max_tokens?: number;
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
  /** Request word-level timestamps (returned in the final chunk). */
  forced_alignment?: boolean;
}

// ── STT SSE stream message types ─────────────────────────────────────────────

export interface TranscribeStreamChunk {
  text: string;
  language: string;
  is_final: boolean;
  chunk_index: number;
  /** Present only on the final chunk when forced_alignment was true. */
  timestamps?: WordTimestamp[];
  /** Set to "unavailable" when forced_alignment was requested but the model emitted no timestamps. */
  alignment?: "unavailable";
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
  /** Request word-level timestamps on partial/segment/final messages. */
  forced_alignment?: boolean;
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
  /** Session-relative word timestamps. Present when forced_alignment was true. */
  timestamps?: WordTimestamp[];
  /** Set when forced_alignment was requested but the model emitted no timestamps. */
  alignment?: "unavailable";
}

export interface SttSegmentMessage {
  type: "segment";
  segment_index: number;
  text: string;
  language: string;
  audio_duration: number;
  reason: string;
  /** Session-relative word timestamps for this segment. */
  timestamps?: WordTimestamp[];
  alignment?: "unavailable";
}

export interface SttFinalMessage {
  type: "final";
  text: string;
  language: string;
  duration: number;
  /** Session-relative word timestamps for the entire session. */
  timestamps?: WordTimestamp[];
  alignment?: "unavailable";
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

export interface MediaPolicy {
  /** Whether this agent supports video tracks. */
  video_enabled?: boolean;
  /** Whether sessions with this agent are recorded to S3 by default. */
  recording_enabled?: boolean;
  /** LiveKit RoomComposite layout (default: "speaker"). */
  recording_layout?: string;
}

export interface MediaOverrides {
  /** Override agent.media_policy.video_enabled for this session/token. */
  video_enabled?: boolean;
  /** Override agent.media_policy.recording_enabled for this session/token. */
  recording_enabled?: boolean;
}

export interface RecordingInfo {
  s3_key: string;
  s3_bucket: string;
  /** "pending" while egress is still running, "ready" once finished, "failed" on egress failure. */
  status: string;
  duration_ms?: number;
  /** Presigned GET URL for the MP4 (only set when status === "ready"). */
  presigned_url?: string | null;
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
  media_policy?: MediaPolicy;
  tool_bindings?: ToolBinding[];
  is_public?: boolean;
  is_platform?: boolean;
  system_prompt?: string;
  language?: string;
  role?: string;
  /** STT model handle (e.g. "stt-flash"). Falls back to tenant/system default when omitted. */
  stt_model?: string;
  /** TTS model handle (e.g. "tts-flash"). Falls back to tenant/system default when omitted. */
  tts_model?: string;
  /** LLM model handle. Falls back to tenant/system default when omitted. */
  llm_model?: string;
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
  media_policy?: MediaPolicy;
  tool_bindings?: ToolBinding[];
  is_public?: boolean;
  is_platform?: boolean;
  status?: string;
  system_prompt?: string;
  language?: string;
  role?: string;
  stt_model?: string;
  tts_model?: string;
  llm_model?: string;
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
  media_policy: MediaPolicy;
  tool_bindings: ToolBinding[];
  is_public: boolean;
  is_platform: boolean;
  status: string;
  system_prompt: string;
  language: string | null;
  role: string | null;
  stt_model: string | null;
  tts_model: string | null;
  llm_model: string | null;
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

/**
 * Request body for the combined voice-session endpoint.
 * Creates a session and mints a LiveKit token in one call.
 */
export interface VoiceSessionRequest {
  message?: string;
  voice_id?: string;
  /** 三方终端用户ID，用作 LiveKit participant identity */
  user_id?: string;
  /** 终端用户显示名，用作 LiveKit participant name */
  user_name?: string;
  metadata?: Record<string, unknown>;
  /** Per-call override of agent.media_policy (video / recording). */
  media_overrides?: MediaOverrides;
}

/**
 * Response from the combined voice-session endpoint.
 * Contains both session info and LiveKit connection details.
 */
export interface VoiceSessionResponse {
  session_id: string;
  room_id: string;
  token: string;
  room_name: string;
  livekit_url: string;
}

// ── Room types ────────────────────────────────────────────────────────────────

export interface AgentBinding {
  agent_id: string;
  count?: number;
}

/** A single phase in a structured conversation flow, generated from speaking_rules. */
export interface PhaseConfig {
  /** Short identifier for this phase. */
  name: string;
  /**
   * Who participates in this phase:
   * - "agent"      — only AI agents speak
   * - "user"       — only human users speak
   * - "agent+user" — both AI agents and human users take turns
   * - "router"     — orchestrator calls tools directly (no speech)
   */
  executor: "agent" | "user" | "agent+user" | "router";
  /** Turn order within this phase. */
  order: "sequential" | "any" | "fixed";
  /**
   * When the phase advances:
   * - "all_acted" — automatically when all required participants have spoken
   * - "external"  — only when deactivate_participant fires (open-ended hold)
   */
  advance_on: "all_acted" | "external";
  /** System prompt used by agents/router in this phase. */
  prompt: string;
  /** Agents tracked for the all_acted check. "active_agents" or "agent:{N}". */
  participants?: string;
}

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
  /** Agent bindings for this room (agent_id + optional instance count). */
  agent_ids?: AgentBinding[];
  /** Access control: "private" (default) | "shared" | "public" */
  visibility?: "private" | "shared" | "public";
  /** Conversation flow mode: "sequential" (default) | "moderator_led" | "freeform" */
  talking_style?: "sequential" | "moderator_led" | "freeform";
  /** Natural-language rules parsed by LLM into structured phases at room creation time. */
  speaking_rules?: string;
  /** Whether to automatically start the session when all agents are ready. */
  auto_start?: boolean;
  /** Default language for all agents in this room (e.g. "zh", "en"). */
  language?: string;
  /** Skill UUIDs bound to this room. */
  skill_ids?: string[];
  /** Tool UUIDs bound to this room. */
  tool_ids?: string[];
  /** Instructions to run before each session starts. */
  pre_session_instructions?: string;
}

export interface RoomUpdate {
  name?: string;
  description?: string;
  room_type?: string;
  room_prompt?: string;
  shared_knowledge?: unknown[];
  policies?: Record<string, unknown>;
  config?: Record<string, unknown>;
  agent_ids?: AgentBinding[];
  visibility?: "private" | "shared" | "public";
  talking_style?: "sequential" | "moderator_led" | "freeform";
  /** Updating speaking_rules automatically regenerates phases via LLM (takes priority over phases). */
  speaking_rules?: string;
  /**
   * Directly set phases, bypassing LLM generation.
   * Ignored if speaking_rules is also provided in the same request.
   */
  phases?: PhaseConfig[];
  /** Directly set whether phases loop. Ignored if speaking_rules is also provided. */
  phase_loop?: boolean;
  auto_start?: boolean;
  /** Default language for all agents in this room (e.g. "zh", "en"). */
  language?: string;
  skill_ids?: string[];
  tool_ids?: string[];
  pre_session_instructions?: string;
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
  agent_ids: AgentBinding[];
  visibility: string;
  talking_style: string;
  speaking_rules: string;
  /**
   * Structured phase definitions generated from speaking_rules at room creation/update time.
   * Empty array if speaking_rules is not set or phase parsing produced no phases.
   */
  phases: PhaseConfig[];
  /** Whether phases loop back to the first phase after the last phase completes. */
  phase_loop: boolean;
  auto_start: boolean;
  /** Default language for all agents in this room. */
  language: string | null;
  skill_ids: string[];
  tool_ids: string[];
  pre_session_instructions: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RoomAddAgent {
  agent_id: string;
  count?: number;
}

export interface RoomAgentListResponse {
  room_id: string;
  agent_ids: AgentBinding[];
}


// ── Session types ─────────────────────────────────────────────────────────────

/** Inline participant context embedded in the participants list response. */
export interface ParticipantInlineContext {
  id: string;
  ref_type: string;
  role: string | null;
  display_name: string | null;
  turn_order: number | null;
  is_active: boolean;
  deactivated_at: string | null;
  variables: Record<string, unknown>;
}

export interface Participant {
  /** "user" | "agent" | custom type */
  type: string;
  /** UUID of the user or agent */
  ref_id: string;
  /** Slot index for multi-instance agents (0-based). */
  slot?: number;
  /** Per-slot unique reference ID used as the context key. */
  context_ref_id?: string;
  /** Participant context data, populated by GET /{session_id}/participants. Null if no context set. */
  context?: ParticipantInlineContext | null;
  [key: string]: unknown;
}

export interface SessionCreate {
  /** Optional voice_id to override the agent's default voice for this session. */
  voice_id?: string;
  config?: Record<string, unknown>;
  participants?: Participant[];
  /** Per-session override of agent.media_policy (video / recording). */
  media_overrides?: MediaOverrides;
}

export interface LiveKitTokenRequest {
  /** 三方终端用户ID，用作 LiveKit participant identity */
  user_id?: string;
  /** 终端用户显示名，用作 LiveKit participant name */
  user_name?: string;
  /** Per-token override of agent.media_policy (video / recording). */
  media_overrides?: MediaOverrides;
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
  /** UUID of the participant this message is directed at (for reply-to / @mention tracking). */
  reply_to_ref_id?: string;
  metadata?: Record<string, unknown>;
}

/** Request body for directing a specific agent to reply (moderator-led dispatch). */
export interface ReplyToMemberRequest {
  /** UUID of the agent to trigger. */
  target_ref_id: string;
}

export interface MessageResponse {
  id: string;
  session_id: string;
  seq_num: number;
  role: string;
  speaker_type: string;
  speaker_ref_id: string | null;
  speaker_name: string | null;
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

/** Request body for moderator-led dispatch: human moderator explicitly triggers an agent. */
export interface ModeratorDispatchRequest {
  /** UUID of the agent to trigger. */
  agent_id: string;
}

export interface ModeratorDispatchResponse {
  agent_id: string;
  agent_idx: number;
}

// ── Channel types ─────────────────────────────────────────────────────────────

export interface ChannelCreate {
  name: string;
  /** Channel type. Default: "api" */
  channel_type?: string;
  target_type: string;
  target_id: string;
  web_url?: string;
  config?: Record<string, unknown>;
}

export interface ChannelUpdate {
  name?: string;
  channel_type?: string;
  target_type?: string;
  target_id?: string;
  web_url?: string;
  config?: Record<string, unknown>;
}

export interface ChannelResponse {
  id: string;
  tenant_id: string;
  name: string;
  channel_type: string;
  target_type: string;
  target_id: string;
  web_url: string | null;
  config: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

// ── Participant Context types ─────────────────────────────────────────────────

export interface ParticipantContextUpsert {
  /** "user" | "agent" */
  ref_type: string;
  role?: string;
  display_name?: string;
  turn_order?: number;
  private_data?: Record<string, unknown>;
  /** Agent-only: override this agent's system prompt for the session. */
  instruction_override?: string;
  /** Agent-only: override agent config fields for the session. */
  config_override?: Record<string, unknown>;
  /** Template variables for {{key}} substitution in prompts. */
  variables?: Record<string, unknown>;
}

export interface ParticipantContextResponse {
  id: string;
  session_id: string;
  ref_id: string;
  ref_type: string;
  role: string | null;
  display_name: string | null;
  turn_order: number | null;
  is_active: boolean;
  deactivated_at: string | null;
  variables: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ParticipantContextPrivateResponse extends ParticipantContextResponse {
  private_data: Record<string, unknown>;
  instruction_override: string | null;
  config_override: Record<string, unknown> | null;
}

// ── Session Action types ──────────────────────────────────────────────────────

export interface SessionActionCreate {
  /** "user" | "agent" */
  actor_ref_type: string;
  /** e.g. "vote" | "answer" | "score" */
  action_type: string;
  round?: number;
  target_ref_id?: string;
  value?: Record<string, unknown>;
}

export interface SessionActionResponse {
  id: string;
  session_id: string;
  actor_ref_id: string;
  actor_ref_type: string;
  action_type: string;
  round: number | null;
  target_ref_id: string | null;
  value: Record<string, unknown>;
  created_at: string;
}

/** Aggregated action counts grouped by target participant. */
export interface ActionCountsResponse {
  action_type: string;
  round: number | null;
  /** Map of target_ref_id → count */
  counts: Record<string, number>;
}

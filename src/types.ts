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
  /**
   * App ID (appid_ prefix) — public identifier of a registered App.
   *
   * Frontend: set `appId` alone (no secret). Safe to embed in a browser; all
   * requests use a short-lived session token (stk_) auto-obtained from the appid
   * (same flow as `publishableKey`). Restrict with the App's Allowed Origins.
   *
   * Backend: set `appId` together with `appSecret`. Requests authenticate via
   * HTTP Basic `base64(appId:appSecret)`.
   */
  appId?: string;
  /**
   * App secret (secret_ prefix) — confidential, BACKEND ONLY. Never expose in a browser.
   * Only meaningful together with `appId`.
   */
  appSecret?: string;
  /**
   * Guest token (gst_ prefix) — low-privilege credential for anonymous/guest users.
   * Obtained from `POST /v1/account/guest`. Used as a static Bearer token.
   * WebSocket connections automatically exchange it for a session token (stk_).
   */
  guestToken?: string;
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
  /**
   * Owner of this voice. `null` means a system-level voice visible to every
   * user; a non-null user id means a voice the caller uploaded themselves.
   * Use this to group "system" vs "my voices" in a picker.
   */
  owner_user_id?: string | null;
  /** Tenant the voice was uploaded under. `null` for system voices. */
  tenant_id?: string | null;
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

export interface TurnPolicy {
  /** Min seconds to wait after the user stops before ending the turn. Lower = snappier, more risk of cutting in. Default 0.4. */
  min_endpointing_delay?: number;
  /** Max seconds to wait when the turn detector thinks the user may not be done. Default 2.0. */
  max_endpointing_delay?: number;
  /** Start LLM generation speculatively during the endpointing window to hide first-token latency. Default true. */
  preemptive_generation?: boolean;
  /** Silero VAD silence (seconds) required to mark end-of-speech. Default 0.5. */
  vad_min_silence_duration?: number;
  /** Extra debounce (seconds) after STT detects silence before committing FINAL. Default 0.5. */
  stt_silence_commit_delay?: number;
}

export interface MediaOverrides {
  /** Override agent.media_policy.video_enabled for this session/token. */
  video_enabled?: boolean;
  /** Override agent.media_policy.recording_enabled for this session/token. */
  recording_enabled?: boolean;
  /** Recording container format. "mp4" | "ogg" | "mp3". Defaults to mp4. */
  recording_format?: string;
  /** Override agent.media_policy.recording_layout (LiveKit RoomComposite layout). */
  recording_layout?: string;
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
  /** Fixed closing statement (English source) spoken verbatim when the session ends; non-English sessions are translated. Empty/omitted falls back to LLM-improvised closing. */
  closing_statement?: string | null;
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
  /** Allow users to interrupt this agent while it is speaking. Defaults to true. */
  allow_interruptions?: boolean;
  /** Allow users to interrupt the agent while it reads its opening line (greeting/welcome/auto-start). Defaults to false. */
  allow_interruptions_opening?: boolean;
  /** Voice turn-timing knobs (endpointing / VAD silence / STT commit / preemptive). */
  turn_policy?: TurnPolicy;
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
  /** Fixed closing statement (English source) spoken verbatim when the session ends; non-English sessions are translated. Send "" to clear. */
  closing_statement?: string | null;
  language?: string;
  role?: string;
  stt_model?: string;
  tts_model?: string;
  llm_model?: string;
  skills?: string[];
  knowledge_bindings?: string[];
  channel_bindings?: string[];
  /** Allow users to interrupt this agent while it is speaking. */
  allow_interruptions?: boolean;
  /** Allow users to interrupt the agent while it reads its opening line (greeting/welcome/auto-start). */
  allow_interruptions_opening?: boolean;
  /** Voice turn-timing knobs (endpointing / VAD silence / STT commit / preemptive). */
  turn_policy?: TurnPolicy;
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
  /** Fixed closing statement spoken verbatim when the session ends; null when unset. */
  closing_statement: string | null;
  language: string | null;
  role: string | null;
  stt_model: string | null;
  tts_model: string | null;
  llm_model: string | null;
  skills: string[];
  knowledge_bindings: string[];
  channel_bindings: string[];
  /** Allow users to interrupt this agent while it is speaking. */
  allow_interruptions: boolean;
  /** Allow users to interrupt the agent while it reads its opening line (greeting/welcome/auto-start). */
  allow_interruptions_opening: boolean;
  /** Voice turn-timing knobs (endpointing / VAD silence / STT commit / preemptive). */
  turn_policy?: TurnPolicy;
  created_at: string;
  updated_at: string;
}

export interface AgentChatResponse {
  session_id: string;
  room_id: string;
}

/**
 * Voices selectable for an agent — the result of resolving the agent's
 * `tts_model` (or the server default when unset) and returning every
 * compatible voice the caller can use.
 *
 * `voices` is the union of system voices (`owner_user_id` null) and the
 * caller's own uploads; inspect each voice's `owner_user_id` to group them.
 */
export interface AgentVoicesResponse {
  agent_id: string;
  /** The TTS model the voices were resolved against. `null` when the agent has none configured and the server fell back to its default. */
  tts_model: string | null;
  voices: Speaker[];
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
  /** Per-call override of agent.media_policy (video / recording / format / layout). */
  media_overrides?: MediaOverrides;
  /** Override agent.language for this session (flows to STT/TTS/LLM). */
  language?: string;
  /** Template variables consumed by `{{key}}` placeholders in agent.system_prompt. */
  variables?: Record<string, unknown>;
  /** Business-facing display name. LiveKit room id is still `session-{session_id}`. */
  room_name?: string;
  /** Auto-terminate the session after this many seconds. */
  max_duration_seconds?: number;
  /** Auto-terminate after this many seconds with no STT/TTS activity. */
  inactivity_timeout_seconds?: number;
  /** Free-form data echoed into every webhook event payload under `data._webhook_metadata`. */
  webhook_metadata?: Record<string, unknown>;
  /** Override `agent.allow_interruptions` for this session. Omit to inherit the agent's default. */
  allow_interruptions?: boolean;
  /** Override `agent.allow_interruptions_opening` for this session. Omit to inherit the agent's default. */
  allow_interruptions_opening?: boolean;
  /** Partial per-session override of `agent.turn_policy` (only the keys to override). Omit to inherit. */
  turn_policy?: TurnPolicy;
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
  /** Per-token override of `agent.allow_interruptions`. Omit to inherit. */
  allow_interruptions?: boolean;
  /** Per-token override of `agent.allow_interruptions_opening`. Omit to inherit. */
  allow_interruptions_opening?: boolean;
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
  /** Origin of the tool: "db" for user-created, "native" for platform built-in session tools. */
  origin?: "db" | "native";
  created_at: string;
  updated_at: string;
}

/** Entry in the native session tools catalog. */
export interface NativeToolEntry {
  name: string;
  description: string;
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

// ── Account types ─────────────────────────────────────────────────────────────────

export interface AccountMeResponse {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  user_type: "guest" | "normal" | "admin";
  status: "active" | "disabled";
  roles: string[];
}

export interface BalanceResponse {
  currency: string;
  balance: number;
  reserved: number;
}

export interface TopUpRequest {
  amount: number;
  currency?: string;
}

export interface GuestLoginRequest {
  /** Persistent device identifier (mobile IDFV/Android ID, web localStorage UUID). */
  device_id?: string;
}

export interface GuestLoginResponse {
  user: AccountMeResponse;
  /** Guest access token (gst_ prefix). */
  access_token: string;
  balance: BalanceResponse;
}

export interface CreateApiKeyRequest {
  name: string;
  expires_at?: string;
  key_type?: "secret" | "publishable";
  allowed_origins?: string[];
}

export interface CreateApiKeyResponse {
  id: string;
  /** Plaintext key — returned once only. */
  key: string;
  created_at: number;
}

export interface UpdateApiKeyRequest {
  allowed_origins: string[];
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key: string | null;
  status: "active" | "revoked";
  key_type: "secret" | "publishable";
  allowed_origins: string[];
  created_at: number;
  last_used_at: number | null;
  expires_at: string | null;
}

export interface UsageRecordItem {
  id: string;
  service: string;
  model: string | null;
  units: number;
  billing_unit: string;
  unit_price: number;
  total_cost: number;
  created_at: number;
}

export interface UsageListResponse {
  data: UsageRecordItem[];
  total: number;
  /** Sum of total_cost across all matching records (not limited by pagination). */
  total_cost: number;
  page: number;
  page_size: number;
}

export interface UsageStatsParams {
  start_date: string;
  end_date: string;
  service?: string;
  granularity?: "hour" | "day" | "month";
}

export interface UsageStatsSummaryItem {
  service: string;
  billing_unit: string;
  total_units: number;
  total_cost: number;
}

export interface UsageSeriesItem {
  date: string;
  service: string;
  units: number;
  cost: number;
}

export interface UsageStatsResponse {
  summary: UsageStatsSummaryItem[];
  series: UsageSeriesItem[];
}

export interface DashboardResponse {
  monthly_cost: number;
  api_key_count: number;
  balance: number;
  reserved: number;
  currency: string;
}

// ── Tenant types ──────────────────────────────────────────────────────────────────

export interface CreateTenantRequest {
  name: string;
  region?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  region?: string;
}

export interface TenantItem {
  id: string;
  name: string;
  region: string | null;
  status: string;
  role_in_tenant: string;
  created_at: number;
}

export interface TenantMemberItem {
  user_id: string;
  email: string;
  display_name: string;
  role_in_tenant: string;
  status: string;
  joined_at: number | null;
}

export interface InviteMemberRequest {
  email: string;
  role_in_tenant?: "owner" | "admin" | "member";
}

export interface InviteResponse {
  invitation_id: string;
  invite_token: string;
  expires_at: number;
}

export interface AcceptInvitationRequest {
  token: string;
}

export interface SwitchTenantRequest {
  tenant_id: string;
}

export interface SwitchTenantResponse {
  tenant_id: string;
  access_token: string;
}

// ── App types ────────────────────────────────────────────────────────────────────

export interface CreateAppRequest {
  name: string;
  allowed_origins?: string[];
  expires_at?: string;
}

export interface CreateAppResponse {
  id: string;
  /** Public identifier for frontend use. */
  app_id: string;
  /** Plaintext secret — returned once only. Store securely. */
  secret: string;
  created_at: number;
}

export interface AppItem {
  id: string;
  name: string;
  app_id: string;
  status: "active" | "revoked";
  allowed_origins: string[];
  created_at: number;
  last_used_at: number | null;
  secret_rotated_at: number | null;
  expires_at: string | null;
}

export interface UpdateAppRequest {
  name?: string;
  allowed_origins?: string[];
}

export interface ResetSecretResponse {
  id: string;
  app_id: string;
  /** New plaintext secret — returned once only. Store securely. */
  secret: string;
}

// ── Webhook types ─────────────────────────────────────────────────────────────────

export interface WebhookEndpointCreate {
  url: string;
  event_types: string[];
  description?: string;
  enabled?: boolean;
}

export interface WebhookEndpointUpdate {
  url?: string;
  event_types?: string[];
  description?: string;
  enabled?: boolean;
}

export interface WebhookEndpointResponse {
  id: string;
  tenant_id: string;
  url: string;
  event_types: string[];
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned only on create/rotate-secret. Includes the plaintext secret once. */
export interface WebhookEndpointCreatedResponse extends WebhookEndpointResponse {
  secret: string;
}

export interface WebhookEndpointListResponse {
  data: WebhookEndpointResponse[];
}

export interface WebhookDeliveryResponse {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  attempt: number;
  status: string;
  response_code: number | null;
  response_body: string | null;
  error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryListResponse {
  data: WebhookDeliveryResponse[];
  total: number;
  page: number;
  page_size: number;
}

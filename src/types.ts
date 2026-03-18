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

export interface AgentCreate {
  name: string;
  description?: string;
  system_prompt?: string;
  voice?: string;
  model?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentUpdate {
  name?: string;
  description?: string;
  system_prompt?: string;
  voice?: string;
  model?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  voice?: string;
  model?: string;
  language?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentChatResponse {
  session_id: string;
  room_id: string;
}

// ── Room types ────────────────────────────────────────────────────────────────

export interface RoomCreate {
  name?: string;
  agent_id?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RoomUpdate {
  name?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RoomResponse {
  id: string;
  name?: string;
  agent_id?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Session types ─────────────────────────────────────────────────────────────

export interface SessionCreate {
  config?: Record<string, unknown>;
}

export interface SessionResponse {
  id: string;
  room_id: string;
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Message types ─────────────────────────────────────────────────────────────

export interface MessageCreate {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessageResponse {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface MessageListResponse {
  data: MessageResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ── Voice types ───────────────────────────────────────────────────────────────

export interface LiveKitTokenResponse {
  token: string;
  room_name: string;
  livekit_url: string;
  session_id: string;
}

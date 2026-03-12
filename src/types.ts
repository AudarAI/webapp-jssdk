export interface TokenData {
  token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AiVoxClientConfig {
  baseUrl: string;
  /** Mode 1: back-end assisted (recommended) */
  tokenProvider?: () => Promise<TokenData>;
  /** Mode 2: publishable key – safe to embed in frontend, backend validates Origin */
  publishableKey?: string;
  /** Mode 3: static session token (for testing) */
  sessionToken?: string;
  /** Seconds before expiry to proactively refresh. Default: 30 */
  refreshThresholdSeconds?: number;
  /** Custom fetch implementation (e.g. node-fetch in Node.js environments) */
  fetch?: typeof globalThis.fetch;
}

export interface Speaker {
  name: string;
  provider: string;
  description?: string;
}

export interface SynthesizeOptions {
  voice?: string;
  model?: string;
  response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  speed?: number;
}

export interface TranscribeOptions {
  language?: string;
  context?: string;
  forced_alignment?: boolean;
}

export interface TranscribeStreamOptions {
  language?: string;
}

export interface ConnectSttWebSocketOptions {
  provider?: string;
  language?: string;
}

export interface TranslateOptions {
  target_lang: string;
  source_lang?: string;
  voice?: string;
  translation_mode?: "text" | "speech";
  response_format?: "mp3" | "wav" | "opus";
  tts_enabled?: boolean;
}

export interface ConnectTranslationWebSocketOptions {
  target_lang: string;
  source_lang?: string;
  voice?: string;
  translation_mode?: "text" | "speech";
  tts_enabled?: boolean;
  response_format?: string;
}

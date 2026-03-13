export { AiVoxClient } from "./client";
export { TtsApi } from "./tts";
export { SttApi, SttWebSocket } from "./stt";
export { TranslationApi, TranslationWebSocket } from "./translation";
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
} from "./types";
export { AiVoxError, AuthenticationError, InsufficientBalanceError, RateLimitedError, ApiError } from "./errors";

import { AiVoxClient } from "./client";
import { TtsApi } from "./tts";
import { SttApi } from "./stt";
import { TranslationApi } from "./translation";
import type { AiVoxClientConfig } from "./types";

/**
 * Convenience factory that creates an AiVoxClient with TTS, STT, and Translation APIs.
 *
 * @example
 * // Publishable key (no backend required, Origin validated server-side)
 * const client = createAiVoxClient({ baseUrl: 'https://api.aivox.com', publishableKey: 'pk_xxx' });
 *
 * @example
 * // Token provider (backend-assisted, recommended for production)
 * const client = createAiVoxClient({
 *   baseUrl: 'https://api.aivox.com',
 *   tokenProvider: async () => fetch('/api/speech-token').then(r => r.json()),
 * });
 */
export function createAiVoxClient(config: AiVoxClientConfig): AiVoxClient & {
  tts: TtsApi;
  stt: SttApi;
  translation: TranslationApi;
} {
  const client = new AiVoxClient(config) as AiVoxClient & {
    tts: TtsApi;
    stt: SttApi;
    translation: TranslationApi;
  };
  client.tts = new TtsApi(client.http);
  client.stt = new SttApi(client.http);
  client.translation = new TranslationApi(client.http);
  return client;
}

export { AiVoxClient } from "./client";
export { TtsApi } from "./tts";
export { SttApi } from "./stt";
export { TranslationApi } from "./translation";
export type { AiVoxClientConfig, TokenData, Speaker, SynthesizeOptions, TranscribeOptions, TranscribeStreamOptions, ConnectSttWebSocketOptions, TranslateOptions, ConnectTranslationWebSocketOptions } from "./types";
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

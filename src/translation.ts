import { HttpClient } from "./client";
import { ConnectTranslationWebSocketOptions, TranslateOptions } from "./types";

export interface TranslationResult {
  text: string;
  source_lang?: string;
  target_lang: string;
  audio_url?: string;
}

export class TranslationApi {
  constructor(private readonly _http: HttpClient) {}

  /** Translate audio to text (and optionally synthesize speech in target language). */
  async translate(audio: Blob | File, options: TranslateOptions): Promise<TranslationResult | ArrayBuffer> {
    const form = new FormData();
    form.append("audio", audio);
    form.append("target_lang", options.target_lang);
    if (options.source_lang) form.append("source_lang", options.source_lang);
    if (options.voice) form.append("voice", options.voice);
    if (options.translation_mode) form.append("translation_mode", options.translation_mode);
    if (options.response_format) form.append("response_format", options.response_format);
    if (options.tts_enabled != null) form.append("tts_enabled", String(options.tts_enabled));

    const expectBinary = options.tts_enabled === true;
    if (expectBinary) {
      const res = await this._http.request<Response>("POST", "/v1/speech/audio/translations", {
        body: form,
        expectBinary: true,
      });
      return res.arrayBuffer();
    }
    return this._http.request<TranslationResult>("POST", "/v1/speech/audio/translations", { body: form });
  }

  /**
   * Open a WebSocket for real-time speech translation.
   *
   * The gateway automatically sends a config frame to the backend on connect.
   * Client only needs to send audio frames + `{"type": "stop"}` to end.
   */
  async connectWebSocket(options: ConnectTranslationWebSocketOptions): Promise<WebSocket> {
    const baseUrl = this._http.getBaseUrl();
    const wsBase = baseUrl.replace(/^http/, "ws");
    const token = await this._http.getToken();

    const params = new URLSearchParams({ token, target_lang: options.target_lang });
    if (options.source_lang) params.set("source_lang", options.source_lang);
    if (options.voice) params.set("voice", options.voice);
    if (options.translation_mode) params.set("translation_mode", options.translation_mode);
    if (options.tts_enabled != null) params.set("tts_enabled", String(options.tts_enabled));
    if (options.response_format) params.set("response_format", options.response_format);

    return new WebSocket(`${wsBase}/v1/speech/audio/translations/ws?${params}`);
  }
}

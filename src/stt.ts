import { HttpClient } from "./client";
import { ConnectSttWebSocketOptions, TranscribeOptions, TranscribeStreamOptions } from "./types";

export interface TranscribeResult {
  text: string;
  language?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export class SttApi {
  constructor(private readonly _http: HttpClient) {}

  /** Transcribe an audio file. Returns transcription result. */
  async transcribe(audio: Blob | File, options: TranscribeOptions = {}): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", audio);
    if (options.language) form.append("language", options.language);
    if (options.context) form.append("context", options.context);
    if (options.forced_alignment != null) form.append("forced_alignment", String(options.forced_alignment));
    return this._http.request<TranscribeResult>("POST", "/v1/speech/audio/transcriptions", { body: form });
  }

  /**
   * Transcribe with streaming SSE response.
   * Returns the raw Response; caller reads `res.body` as a stream of SSE events.
   */
  async transcribeStream(audio: Blob | File, options: TranscribeStreamOptions = {}): Promise<Response> {
    const form = new FormData();
    form.append("file", audio);
    if (options.language) form.append("language", options.language);
    return this._http.request<Response>("POST", "/v1/speech/audio/transcriptions/stream", {
      body: form,
      expectBinary: true,
    });
  }

  /**
   * Open a WebSocket for real-time speech-to-text.
   * Token is appended as a query parameter (WebSocket can't set Authorization headers).
   */
  async connectWebSocket(options: ConnectSttWebSocketOptions = {}): Promise<WebSocket> {
    // Obtain current token via the http client's internal manager
    // We expose getBaseUrl() so we can build the WS URL
    const baseUrl = this._http.getBaseUrl();
    const wsBase = baseUrl.replace(/^http/, "ws");

    const token = await this._http.getToken();

    const params = new URLSearchParams({ token });
    if (options.provider) params.set("provider", options.provider);
    if (options.language) params.set("language", options.language);

    return new WebSocket(`${wsBase}/v1/speech/audio/transcriptions/ws?${params}`);
  }
}

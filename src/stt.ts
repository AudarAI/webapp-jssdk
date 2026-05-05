import { HttpClient } from "./client";
import {
  ConnectSttWebSocketOptions,
  SttMessage,
  SttWebSocketHandlers,
  TranscribeOptions,
  TranscribeStreamChunk,
  TranscribeStreamHandlers,
  TranscribeStreamOptions,
  WordTimestamp,
} from "./types";

export interface TranscribeResult {
  text: string;
  language?: string;
  timestamps?: WordTimestamp[];
}

/** Wraps the STT WebSocket with typed message handling (v2 protocol). */
export class SttWebSocket {
  private readonly _ws: WebSocket;

  constructor(ws: WebSocket, handlers: SttWebSocketHandlers = {}) {
    this._ws = ws;

    ws.onmessage = (event) => {
      let msg: SttMessage;
      try {
        msg = JSON.parse(event.data as string) as SttMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "ready":
          // Auto-send start after receiving ready (required by v2 protocol)
          ws.send(JSON.stringify({ type: "start" }));
          handlers.onReady?.(msg);
          break;
        case "partial":
          handlers.onPartial?.(msg);
          break;
        case "segment":
          handlers.onSegment?.(msg);
          break;
        case "final":
          handlers.onFinal?.(msg);
          break;
        case "error":
          if (handlers.onError) handlers.onError(msg);
          break;
      }
    };

    if (handlers.onError) ws.onerror = handlers.onError;
    if (handlers.onClose) ws.onclose = handlers.onClose;
  }

  /** Send a PCM audio frame (ArrayBuffer or Int16Array). */
  sendAudio(buffer: ArrayBuffer | Int16Array): void {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(buffer instanceof Int16Array ? buffer.buffer : buffer);
    }
  }

  /** Signal end of audio stream. The server will flush and close. */
  stop(): void {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "stop" }));
    }
  }

  close(): void {
    this._ws.close();
  }

  get readyState(): number {
    return this._ws.readyState;
  }
}

export class SttApi {
  constructor(private readonly _http: HttpClient) {}

  /** Transcribe an audio file. Returns transcription result. */
  async transcribe(audio: Blob | File, options: TranscribeOptions = {}): Promise<TranscribeResult> {
    const { provider, ...fields } = options;
    const form = new FormData();
    form.append("file", audio);
    if (fields.language) form.append("language", fields.language);
    if (fields.forced_alignment != null) form.append("forced_alignment", String(fields.forced_alignment));
    return this._http.request<TranscribeResult>("POST", "/v1/speech/audio/transcriptions", {
      body: form,
      query: provider ? { provider } : undefined,
    });
  }

  /**
   * Transcribe audio with SSE streaming.
   *
   * Parses server-sent events automatically and calls the appropriate handler
   * for each message. Returns the final transcription result when the stream ends.
   *
   * @example
   * const result = await client.stt.transcribeStream(audioBlob, { language: 'zh' }, {
   *   onChunk: (chunk) => console.log('Partial:', chunk.text),
   *   onFinal: (chunk) => console.log('Final:', chunk.text),
   * });
   */
  async transcribeStream(
    audio: Blob | File,
    options: TranscribeStreamOptions = {},
    handlers: TranscribeStreamHandlers = {},
  ): Promise<TranscribeResult> {
    const { provider, language, forced_alignment } = options;
    const form = new FormData();
    form.append("file", audio);
    if (language) form.append("language", language);
    if (forced_alignment != null) form.append("forced_alignment", String(forced_alignment));

    const resp = await this._http.request<Response>("POST", "/v1/speech/audio/transcriptions/stream", {
      body: form,
      query: provider ? { provider } : undefined,
      expectBinary: true,
    });

    if (!resp.body) throw new Error("No response body from STT stream");

    let finalChunk: TranscribeStreamChunk | null = null;
    const decoder = new TextDecoder();
    let buffer = "";
    const reader = resp.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (typeof parsed.error === "string") {
            handlers.onError?.(new Error(parsed.error));
            continue;
          }

          const chunk = parsed as unknown as TranscribeStreamChunk;
          handlers.onChunk?.(chunk);
          if (chunk.is_final) {
            handlers.onFinal?.(chunk);
            finalChunk = chunk;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text: finalChunk?.text ?? "",
      language: finalChunk?.language,
      timestamps: finalChunk?.timestamps,
    };
  }

  /**
   * Open a WebSocket for real-time speech-to-text.
   *
   * The SDK automatically sends `{"type":"start"}` after receiving the server's `ready` message.
   *
   * @example
   * const stt = await client.stt.connectWebSocket({ language: 'zh' }, {
   *   onPartial: (msg) => console.log('Partial:', msg.text),
   *   onFinal: (msg) => console.log('Final:', msg.text),
   * });
   * stt.sendAudio(pcmBuffer);
   * stt.stop();
   */
  async connectWebSocket(
    options: ConnectSttWebSocketOptions = {},
    handlers: SttWebSocketHandlers = {},
  ): Promise<SttWebSocket> {
    const baseUrl = this._http.getBaseUrl();
    const wsBase = baseUrl.replace(/^http/, "ws");
    const token = await this._http.getWebSocketToken();

    const params = new URLSearchParams({ token });
    if (options.provider) params.set("provider", options.provider);
    if (options.language) params.set("language", options.language);
    if (options.forced_alignment != null) {
      params.set("forced_alignment", String(options.forced_alignment));
    }

    const ws = new WebSocket(`${wsBase}/v1/speech/audio/transcriptions/ws?${params}`);
    return new SttWebSocket(ws, handlers);
  }
}

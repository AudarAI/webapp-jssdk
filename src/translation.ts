import { HttpClient } from "./client";
import {
  ConnectTranslationWebSocketOptions,
  TranslateHandlers,
  TranslateOptions,
  TranslationMessage,
  TranslationSseErrorMessage,
  TranslationSsePipelineCompleteMessage,
  TranslationSseStatusMessage,
  TranslationSseSttFinalMessage,
  TranslationSseSttPartialMessage,
  TranslationSseTtsChunkMessage,
  TranslationSseTtsCompleteMessage,
  TranslationSseTranslationCompleteMessage,
  TranslationSseTranslationPartialMessage,
  TranslationTtsChunkMessage,
  TranslationWebSocketHandlers,
} from "./types";

export interface TranslationResult {
  /** Original transcribed text from the source audio. */
  source_text: string;
  /** Translated text in the target language. */
  text: string;
  source_lang?: string;
  target_lang: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Wraps the Translation WebSocket with typed message handling. */
export class TranslationWebSocket {
  private readonly _ws: WebSocket;

  constructor(ws: WebSocket, handlers: TranslationWebSocketHandlers = {}) {
    this._ws = ws;

    ws.onmessage = (event) => {
      let msg: TranslationMessage;
      try {
        msg = JSON.parse(event.data as string) as TranslationMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "ready":
          handlers.onReady?.(msg);
          break;
        case "stt_partial":
          handlers.onSttPartial?.(msg);
          break;
        case "stt_segment":
          handlers.onSttSegment?.(msg);
          break;
        case "translation_complete":
          handlers.onTranslationComplete?.(msg);
          break;
        case "tts_chunk": {
          if (handlers.onTtsChunk) {
            const { audio, type, ...meta } = msg as TranslationTtsChunkMessage;
            handlers.onTtsChunk(base64ToArrayBuffer(audio), meta);
          }
          break;
        }
        case "segment_complete":
          handlers.onSegmentComplete?.(msg);
          break;
        case "pipeline_complete":
          handlers.onPipelineComplete?.(msg);
          break;
        case "error":
          handlers.onError?.(msg);
          break;
      }
    };

    if (handlers.onClose) ws.onclose = handlers.onClose;
  }

  /** Send a PCM audio frame (ArrayBuffer or Int16Array). */
  sendAudio(buffer: ArrayBuffer | Int16Array): void {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(buffer instanceof Int16Array ? buffer.buffer : buffer);
    }
  }

  /** Signal end of audio stream. */
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

export class TranslationApi {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Translate audio via the SSE pipeline (STT → Translation → TTS).
   *
   * The server streams events for each stage. Provide handlers to react in
   * real-time; the method returns the final result when the pipeline completes.
   *
   * @example
   * const result = await client.translation.translate(audioBlob,
   *   { target_lang: 'en', tts_enabled: true },
   *   {
   *     onSttPartial:          ({ text }) => showSubtitle(text),
   *     onTranslationPartial:  ({ text }) => showTranslation(text),
   *     onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
   *     onPipelineComplete:    ({ source_text, translated_text }) => console.log(source_text, translated_text),
   *     onError:               ({ stage, message }) => console.error(stage, message),
   *   },
   * );
   */
  async translate(
    audio: Blob | File,
    options: TranslateOptions,
    handlers: TranslateHandlers = {},
  ): Promise<TranslationResult> {
    const form = new FormData();
    form.append("audio", audio);
    form.append("target_lang", options.target_lang);
    if (options.source_lang) form.append("source_lang", options.source_lang);
    if (options.voice) form.append("voice", options.voice);
    if (options.translation_mode) form.append("translation_mode", options.translation_mode);
    if (options.response_format) form.append("response_format", options.response_format);
    if (options.tts_enabled != null) form.append("tts_enabled", String(options.tts_enabled));

    const resp = await this._http.request<Response>("POST", "/v1/speech/audio/translations", {
      body: form,
      expectBinary: true,
    });

    if (!resp.body) throw new Error("No response body from translation stream");

    let pipelineComplete: TranslationSsePipelineCompleteMessage | null = null;
    let translationComplete: TranslationSseTranslationCompleteMessage | null = null;

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

          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }

          switch (msg.type) {
            case "status":
              handlers.onStatus?.(msg as unknown as TranslationSseStatusMessage);
              break;
            case "stt_partial":
              handlers.onSttPartial?.(msg as unknown as TranslationSseSttPartialMessage);
              break;
            case "stt_final":
              handlers.onSttFinal?.(msg as unknown as TranslationSseSttFinalMessage);
              break;
            case "translation_partial":
              handlers.onTranslationPartial?.(msg as unknown as TranslationSseTranslationPartialMessage);
              break;
            case "translation_complete":
              translationComplete = msg as unknown as TranslationSseTranslationCompleteMessage;
              handlers.onTranslationComplete?.(translationComplete);
              break;
            case "tts_chunk": {
              if (handlers.onTtsChunk) {
                const { audio, type, ...meta } = msg as unknown as TranslationSseTtsChunkMessage;
                handlers.onTtsChunk(base64ToArrayBuffer(audio), meta);
              }
              break;
            }
            case "tts_complete":
              handlers.onTtsComplete?.(msg as unknown as TranslationSseTtsCompleteMessage);
              break;
            case "pipeline_complete":
              pipelineComplete = msg as unknown as TranslationSsePipelineCompleteMessage;
              handlers.onPipelineComplete?.(pipelineComplete);
              break;
            case "error":
              handlers.onError?.(msg as unknown as TranslationSseErrorMessage);
              break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      source_text: pipelineComplete?.source_text ?? "",
      text: pipelineComplete?.translated_text ?? translationComplete?.text ?? "",
      source_lang: translationComplete?.source_lang,
      target_lang: translationComplete?.target_lang ?? options.target_lang,
    };
  }

  /**
   * Open a WebSocket for real-time speech translation.
   *
   * Server message types:
   * - `ready`               — session established
   * - `stt_partial`         — real-time ASR partial result
   * - `stt_segment`         — ASR segment finalized
   * - `translation_complete`— translation result for one segment
   * - `tts_chunk`           — TTS audio chunk (decoded to ArrayBuffer in onTtsChunk)
   * - `segment_complete`    — full segment (source + translated text) done
   * - `pipeline_complete`   — all segments processed
   * - `error`               — pipeline error with optional stage info
   *
   * @example
   * const ws = await client.translation.connectWebSocket(
   *   { target_lang: 'en', source_lang: 'zh', tts_enabled: true },
   *   {
   *     onReady: ({ session_id }) => console.log('Session:', session_id),
   *     onSttPartial: ({ text }) => setSubtitle(text),
   *     onTranslationComplete: ({ text }) => setTranslation(text),
   *     onTtsChunk: (audio, { format, sample_rate }) => playAudio(audio),
   *     onPipelineComplete: ({ duration }) => console.log('Done in', duration, 's'),
   *     onError: ({ message, stage }) => console.error(stage, message),
   *   }
   * );
   * ws.sendAudio(pcmBuffer);
   * ws.stop();
   */
  async connectWebSocket(
    options: ConnectTranslationWebSocketOptions,
    handlers: TranslationWebSocketHandlers = {},
  ): Promise<TranslationWebSocket> {
    const baseUrl = this._http.getBaseUrl();
    const wsBase = baseUrl.replace(/^http/, "ws");
    const token = await this._http.getToken();

    const params = new URLSearchParams({ token, target_lang: options.target_lang });
    if (options.source_lang) params.set("source_lang", options.source_lang);
    if (options.voice) params.set("voice", options.voice);
    if (options.translation_mode) params.set("translation_mode", options.translation_mode);
    if (options.tts_enabled != null) params.set("tts_enabled", String(options.tts_enabled));
    if (options.response_format) params.set("response_format", options.response_format);

    const ws = new WebSocket(`${wsBase}/v1/speech/audio/translations/ws?${params}`);
    return new TranslationWebSocket(ws, handlers);
  }
}

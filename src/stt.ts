import { AudioPreprocess, TranscodeOptions, preprocessForAsr } from "./audio";
import { HttpClient } from "./client";
import { ApiError } from "./errors";
import {
  ConnectSttWebSocketOptions,
  ModelInfo,
  SpeakerTurn,
  SttMessage,
  SttWebSocketHandlers,
  TranscribeOptions,
  TranscribeStreamChunk,
  TranscribeStreamHandlers,
  TranscribeStreamOptions,
  TranscriptionSegment,
  ViaUpload,
  WordTimestamp,
} from "./types";

export interface TranscribeResult {
  text: string;
  language?: string;
  timestamps?: WordTimestamp[];
  /** Grouped, sentence-level segments (adjacent same-speaker word runs).
   * Present when forced_alignment or diarize_model was set. Coarser than
   * `timestamps` (word/char level). */
  segments?: TranscriptionSegment[];
  /** Speaker-attributed turns. Present when diarize_model was set. */
  turns?: SpeakerTurn[];
  /** Distinct speaker labels. Present when diarize_model was set. */
  speakers?: string[];
  /** Number of distinct speakers. Present when diarize_model was set. */
  n_speakers?: number;
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
        case "speaker_turn":
          handlers.onSpeakerTurn?.(msg);
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

function asrUploadName(original: Blob | File, converted: boolean): string {
  const name = (original as File).name || "audio";
  if (!converted) return name;
  return `${name.replace(/\.[^./\\]*$/, "")}.wav`;
}

/** A minted direct-to-storage upload slot (POST /v1/speech/audio/uploads). */
export interface AudioUploadTicket {
  upload_id: string;
  /** Presigned URL. PUT the raw bytes here — not multipart, no Authorization header. */
  upload_url: string;
  method: string;
  expires_in: number;
  max_bytes: number;
}

/**
 * Above this many bytes, route the audio around the API and straight to storage.
 *
 * A CDN fronts the API and rejects request bodies over its per-plan cap (100MB on
 * Cloudflare Free/Pro) at the edge, returning 413 before the server sees the
 * request. 80MB leaves headroom for multipart framing and the other form fields.
 */
const DEFAULT_UPLOAD_THRESHOLD = 80 * 1024 * 1024;

export class SttApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Direct-to-storage upload (for audio past the CDN request-body cap) ────

  /**
   * Mint an upload slot. Prefer {@link uploadAudio}, which also performs the PUT.
   *
   * Returns 503 on deployments where object storage isn't configured; large
   * uploads then fall back to going through the API, where the edge cap applies.
   */
  async createUpload(filename: string, contentType?: string): Promise<AudioUploadTicket> {
    return this._http.request<AudioUploadTicket>("POST", "/v1/speech/audio/uploads", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content_type: contentType }),
    });
  }

  /** Release an upload and its stored object. Optional — uploads expire on their own. */
  async deleteUpload(uploadId: string): Promise<void> {
    await this._http.request("DELETE", `/v1/speech/audio/uploads/${encodeURIComponent(uploadId)}`);
  }

  /**
   * Mint a slot and PUT `audio` straight to object storage, bypassing the API
   * (and therefore the CDN body cap). Returns the ticket; pass its `upload_id`
   * to `transcribe` / `transcribeStream` in place of the file.
   *
   * The PUT deliberately carries no Authorization header — the signature is in
   * the URL's query string, and adding headers the signature doesn't cover is a
   * common cause of SignatureDoesNotMatch.
   */
  async uploadAudio(audio: Blob, filename: string, contentType?: string): Promise<AudioUploadTicket> {
    const ticket = await this.createUpload(filename, contentType ?? audio.type ?? undefined);
    const res = await fetch(ticket.upload_url, { method: ticket.method || "PUT", body: audio });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ApiError(`Upload to storage failed: ${res.status} ${detail}`.trim(), res.status, res.status);
    }
    return ticket;
  }

  /**
   * Downscale the audio if worthwhile, then attach it to `form` — as a direct
   * `file` part, or as an `upload_id` when it is large enough that the edge
   * would reject the body.
   *
   * The filename is set explicitly rather than left to FormData: the server picks
   * its duration-probe strategy from the extension, and duration is what gets
   * billed. A converted blob with the original `.m4a` name would send the probe
   * down the wrong path, and an unnamed Blob would arrive as "blob".
   */
  private async _attachAudio(
    form: FormData,
    audio: Blob | File,
    options: { preprocess?: AudioPreprocess; transcode?: TranscodeOptions; viaUpload?: ViaUpload; uploadThresholdBytes?: number },
  ): Promise<void> {
    const pre = await preprocessForAsr(audio, options.preprocess ?? "auto", options.transcode ?? {});
    const name = asrUploadName(audio, pre.applied);

    const mode = options.viaUpload ?? "auto";
    const threshold = options.uploadThresholdBytes ?? DEFAULT_UPLOAD_THRESHOLD;
    const wantsUpload = mode === "always" || (mode === "auto" && pre.data.size > threshold);

    if (wantsUpload) {
      try {
        const ticket = await this.uploadAudio(pre.data, name);
        form.append("upload_id", ticket.upload_id);
        return;
      } catch (e) {
        // 'always' means the caller has decided; surface the real failure.
        if (mode === "always") throw e;
        // Otherwise fall through to a direct upload. Storage may simply not be
        // configured on this deployment, and a body under the edge cap still
        // succeeds — falling back is never worse than not having tried.
      }
    }

    form.append("file", pre.data, name);
  }

  /** List available STT models registered in model_management. */
  async listModels(): Promise<ModelInfo[]> {
    return this._http.request<ModelInfo[]>("GET", "/v1/speech/stt/models");
  }

  /** Transcribe an audio file. Returns transcription result. */
  async transcribe(audio: Blob | File, options: TranscribeOptions = {}): Promise<TranscribeResult> {
    const { provider, preprocess, transcode, viaUpload, uploadThresholdBytes, ...fields } = options;
    const form = new FormData();
    await this._attachAudio(form, audio, { preprocess, transcode, viaUpload, uploadThresholdBytes });
    if (fields.language) form.append("language", fields.language);
    if (fields.context) form.append("context", fields.context);
    if (fields.forced_alignment != null) form.append("forced_alignment", String(fields.forced_alignment));
    if (fields.asr_model) form.append("asr_model", fields.asr_model);
    if (fields.diarize_model) form.append("diarize_model", fields.diarize_model);
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
    const { provider, language, forced_alignment, asr_model, diarize_model, preprocess, transcode, viaUpload, uploadThresholdBytes } = options;
    const form = new FormData();
    await this._attachAudio(form, audio, { preprocess, transcode, viaUpload, uploadThresholdBytes });
    if (language) form.append("language", language);
    if (forced_alignment != null) form.append("forced_alignment", String(forced_alignment));
    if (asr_model) form.append("asr_model", asr_model);
    if (diarize_model) form.append("diarize_model", diarize_model);

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
      segments: finalChunk?.segments,
      turns: finalChunk?.turns,
      speakers: finalChunk?.speakers,
      n_speakers: finalChunk?.n_speakers,
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
    const wsBase = this._http.getWsBaseUrl();
    const token = await this._http.getWebSocketToken();

    const params = new URLSearchParams({ token });
    if (options.provider) params.set("provider", options.provider);
    if (options.language) params.set("language", options.language);
    if (options.asr_model) params.set("asr_model", options.asr_model);
    if (options.context) params.set("context", options.context);
    if (options.forced_alignment != null) {
      params.set("forced_alignment", String(options.forced_alignment));
    }
    if (options.asr_model) params.set("asr_model", options.asr_model);
    if (options.diarize_model) params.set("diarize_model", options.diarize_model);

    const ws = new WebSocket(`${wsBase}/v1/speech/audio/transcriptions/ws?${params}`);
    return new SttWebSocket(ws, handlers);
  }
}

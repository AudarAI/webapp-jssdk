import { HttpClient } from "./client";
import {
  ConnectVoiceActionsWebSocketOptions,
  VoiceActionsErrorMessage,
  VoiceActionsMessage,
  VoiceActionsWebSocketHandlers,
} from "./types";

/** Wraps the voice-actions WebSocket with typed message handling. */
export class VoiceActionsWebSocket {
  private readonly _ws: WebSocket;
  /**
   * Audio is held back until `stream_start` has gone out: the service starts a stream with the
   * game's defaults on the first audio frame, so a frame sent before it would silently discard
   * the requested profile.
   */
  private _started = false;

  constructor(ws: WebSocket, options: ConnectVoiceActionsWebSocketOptions, handlers: VoiceActionsWebSocketHandlers = {}) {
    this._ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let msg: VoiceActionsMessage | { type?: undefined; code: number; message: string };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "ready":
          ws.send(JSON.stringify({ ...options.streamOptions, type: "stream_start", ...(options.profile ? { profile: options.profile } : {}) }));
          this._started = true;
          handlers.onReady?.(msg);
          break;
        case "endpoint":
          handlers.onEndpoint?.(msg);
          break;
        case "action":
          handlers.onAction?.(msg);
          break;
        case "committed":
          handlers.onCommitted?.(msg);
          break;
        case "pong":
          if (typeof msg.t === "number") handlers.onPong?.(msg, performance.now() - msg.t);
          break;
        case "error":
          handlers.onError?.(msg);
          break;
        default:
          // The gateway's own rejections carry no `type` (see VoiceActionsErrorMessage).
          if (typeof (msg as { code?: unknown }).code === "number") {
            const m = msg as { code: number; message?: string };
            const err: VoiceActionsErrorMessage = { type: "error", code: m.code, message: m.message ?? "" };
            handlers.onError?.(err);
          }
      }
    };

    if (handlers.onError) ws.onerror = handlers.onError;
    if (handlers.onClose) ws.onclose = handlers.onClose;
  }

  /**
   * Send microphone audio: PCM16 little-endian, mono, 16 kHz. Any length is accepted; 20 ms
   * (640-byte) frames give the lowest latency. Dropped until the server is ready.
   */
  sendAudio(buffer: ArrayBuffer | Int16Array): void {
    if (this._started && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(buffer instanceof Int16Array ? buffer.buffer : buffer);
    }
  }

  /**
   * Measure the network round trip: the service answers at once with a `pong` (delivered to
   * `onPong` with the elapsed time), without involving the model. Ignored until the socket is open.
   */
  ping(): void {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ping", t: performance.now() }));
    }
  }

  /** End the session. The service has no stop message; closing the socket is the stop. */
  close(): void {
    this._ws.close();
  }

  get readyState(): number {
    return this._ws.readyState;
  }
}

/** Voice game actions (speech2action): the model picks a move from the audio alone. */
export class VoiceActionsApi {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Open a voice-actions WebSocket.
   *
   * @example
   * const va = await client.voiceActions.connectWebSocket({ game: 'runner', profile: 'fast' }, {
   *   onAction: (msg) => game.do(msg.action),
   * });
   * va.sendAudio(pcm16Frame);
   * va.close();
   */
  async connectWebSocket(
    options: ConnectVoiceActionsWebSocketOptions = {},
    handlers: VoiceActionsWebSocketHandlers = {},
  ): Promise<VoiceActionsWebSocket> {
    const wsBase = this._http.getWsBaseUrl();
    const token = await this._http.getWebSocketToken();

    const params = new URLSearchParams({ token, game: options.game ?? "runner" });
    const ws = new WebSocket(`${wsBase}/v1/speech/voice-actions/ws?${params}`);
    return new VoiceActionsWebSocket(ws, options, handlers);
  }
}

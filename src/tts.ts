import { HttpClient } from "./client";
import { Speaker, SynthesizeOptions } from "./types";

export class TtsApi {
  constructor(private readonly _http: HttpClient) {}

  /** Synthesize speech and return an ArrayBuffer of audio data. */
  async synthesize(text: string, options: SynthesizeOptions = {}): Promise<ArrayBuffer> {
    const res = await this._http.request<Response>("POST", "/v1/speech/audio/speech", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...options }),
      expectBinary: true,
    });
    return res.arrayBuffer();
  }

  /**
   * Synthesize speech as a streaming Response.
   * Caller can pipe res.body to a Web Audio API or write to a file.
   */
  async synthesizeStream(text: string, options: SynthesizeOptions = {}): Promise<Response> {
    return this._http.request<Response>("POST", "/v1/speech/audio/speech/stream", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...options }),
      expectBinary: true,
    });
  }

  /** List available voices/speakers. */
  async listSpeakers(provider?: string): Promise<Speaker[]> {
    return this._http.request<Speaker[]>("GET", "/v1/speech/audio/speakers", {
      query: provider ? { provider } : undefined,
    });
  }

  /** Upload a custom speaker voice profile. */
  async addSpeaker(
    name: string,
    audioFile: Blob | File,
    options: { transcript?: string; description?: string } = {}
  ): Promise<Speaker> {
    const form = new FormData();
    form.append("name", name);
    form.append("audio_file", audioFile);
    if (options.transcript) form.append("transcript", options.transcript);
    if (options.description) form.append("description", options.description);
    return this._http.request<Speaker>("POST", "/v1/speech/audio/speakers", { body: form });
  }

  /** Delete a custom speaker voice profile. */
  async deleteSpeaker(name: string, provider?: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/speech/audio/speakers/${encodeURIComponent(name)}`, {
      query: provider ? { provider } : undefined,
    });
  }
}

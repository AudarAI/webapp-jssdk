import { HttpClient } from "./client";
import { ListSpeakersResponse, Speaker, SpeakerOperationResponse, SynthesizeOptions } from "./types";

export class TtsApi {
  constructor(private readonly _http: HttpClient) {}

  /** Synthesize speech and return an ArrayBuffer of audio data. */
  async synthesize(text: string, options: SynthesizeOptions = {}): Promise<ArrayBuffer> {
    const { provider, voice, model, response_format, speed,
            temperature, top_p, top_k, seed, min_tokens, max_tokens } = options;
    const body = {
      text,
      voice:           voice           || "default",
      model:           model           || "tts-1",
      response_format: response_format || "mp3",
      speed:           speed           ?? 1.0,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(top_p       !== undefined ? { top_p }       : {}),
      ...(top_k       !== undefined ? { top_k }       : {}),
      ...(seed        !== undefined ? { seed }        : {}),
      ...(min_tokens  !== undefined ? { min_tokens }  : {}),
      ...(max_tokens  !== undefined ? { max_tokens }  : {}),
    };
    const res = await this._http.request<Response>("POST", "/v1/speech/audio/speech", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      query: provider ? { provider } : undefined,
      expectBinary: true,
    });
    return res.arrayBuffer();
  }

  /**
   * Synthesize speech as a streaming Response.
   * Caller can pipe res.body to a Web Audio API or write to a file.
   */
  async synthesizeStream(text: string, options: SynthesizeOptions = {}): Promise<Response> {
    const { provider, voice, model, response_format, speed,
            temperature, top_p, top_k, seed, min_tokens, max_tokens } = options;
    const body = {
      text,
      voice:           voice           || "default",
      model:           model           || "tts-1",
      response_format: response_format || "mp3",
      speed:           speed           ?? 1.0,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(top_p       !== undefined ? { top_p }       : {}),
      ...(top_k       !== undefined ? { top_k }       : {}),
      ...(seed        !== undefined ? { seed }        : {}),
      ...(min_tokens  !== undefined ? { min_tokens }  : {}),
      ...(max_tokens  !== undefined ? { max_tokens }  : {}),
    };
    return this._http.request<Response>("POST", "/v1/speech/audio/speech/stream", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      query: provider ? { provider } : undefined,
      expectBinary: true,
    });
  }

  /** List available voices/speakers. */
  async listSpeakers(): Promise<string[]> {
    const res = await this._http.request<ListSpeakersResponse>("GET", "/v1/speech/audio/speakers");
    return res.speakers.map((s) => s.name);
  }

  /**
   * Upload a custom speaker voice profile.
   * @param transcript - Required reference text for the audio recording.
   */
  async addSpeaker(
    name: string,
    audioFile: Blob | File,
    transcript: string,
    options: { description?: string } = {}
  ): Promise<SpeakerOperationResponse> {
    const form = new FormData();
    form.append("name", name);
    form.append("audio_file", audioFile);
    form.append("transcript", transcript);
    if (options.description) form.append("description", options.description);
    return this._http.request<SpeakerOperationResponse>("POST", "/v1/speech/audio/speakers", {
      body: form,
    });
  }

  /** Delete a custom speaker voice profile. */
  async deleteSpeaker(name: string): Promise<SpeakerOperationResponse> {
    return this._http.request<SpeakerOperationResponse>(
      "DELETE",
      `/v1/speech/audio/speakers/${encodeURIComponent(name)}`,
    );
  }
}

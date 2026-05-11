import { HttpClient } from "./client";
import {
  ListSpeakersResponse,
  ModelInfo,
  Speaker,
  SpeakerOperationResponse,
  SynthesizeOptions,
  VoiceMetadata,
} from "./types";

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

  /** List available TTS models registered in model_management. */
  async listModels(): Promise<ModelInfo[]> {
    return this._http.request<ModelInfo[]>("GET", "/v1/speech/tts/models");
  }

  /** List available voices/speakers (names only, kept for backward compatibility). */
  async listSpeakers(): Promise<string[]> {
    const res = await this._http.request<ListSpeakersResponse>("GET", "/v1/speech/audio/speakers");
    return res.speakers.map((s) => s.name);
  }

  /**
   * List voices/speakers with full per-voice payload (description, metadata,
   * compatible_models, ...).
   *
   * @param modelName - When set, returns only voices whose
   *   `compatible_models` list contains this TTS model name (e.g.
   *   `"tts-pro-xpression-v1"`).
   */
  async listSpeakersDetailed(modelName?: string): Promise<Speaker[]> {
    const res = await this._http.request<ListSpeakersResponse>(
      "GET",
      "/v1/speech/audio/speakers",
      { query: modelName ? { model: modelName } : undefined },
    );
    return res.speakers ?? [];
  }

  /**
   * Upload a custom speaker voice profile.
   * @param transcript - Required reference text for the audio recording.
   * @param options.compatibleModels - TTS model names this voice can be used
   *   with (e.g. `["tts-flash", "tts-turbo"]`). When omitted the server stores
   *   an empty list; the lifespan backfill only fires at boot, so production
   *   callers should always pass this for new voices.
   * @param options.metadata - Free-form per-voice metadata. Sent as flat
   *   form fields when present.
   */
  async addSpeaker(
    name: string,
    audioFile: Blob | File,
    transcript: string,
    options: {
      description?: string;
      compatibleModels?: string[];
      metadata?: VoiceMetadata;
    } = {}
  ): Promise<SpeakerOperationResponse> {
    const form = new FormData();
    form.append("name", name);
    form.append("audio_file", audioFile);
    form.append("transcript", transcript);
    if (options.description) form.append("description", options.description);
    if (options.compatibleModels && options.compatibleModels.length > 0) {
      form.append("compatible_models", options.compatibleModels.join(","));
    }
    const m = options.metadata;
    if (m) {
      if (m.gender)               form.append("gender", m.gender);
      if (m.language)             form.append("language", m.language);
      if (m.accent)               form.append("accent", m.accent);
      if (m.tone)                 form.append("tone", m.tone);
      if (m.duration_s !== undefined && m.duration_s !== null) {
        form.append("duration_s", String(m.duration_s));
      }
      if (m.expression_tags && m.expression_tags.length > 0) {
        form.append("expression_tags", m.expression_tags.join(","));
      }
      if (m.original_profile_id)  form.append("original_profile_id", m.original_profile_id);
      if (m.sample_file)          form.append("sample_file", m.sample_file);
    }
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

  /**
   * Update a speaker's description, metadata and/or compatible_models without
   * touching the stored reference audio or codes. Any field left ``undefined``
   * is preserved server-side. Pass ``description: ""`` to clear it.
   */
  async updateSpeaker(
    name: string,
    patch: {
      description?: string | null;
      compatibleModels?: string[];
      metadata?: VoiceMetadata;
    },
  ): Promise<SpeakerOperationResponse> {
    const body: Record<string, unknown> = {};
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.compatibleModels !== undefined)
      body.compatible_models = patch.compatibleModels;
    if (patch.metadata !== undefined) body.metadata = patch.metadata;
    return this._http.request<SpeakerOperationResponse>(
      "PATCH",
      `/v1/speech/audio/speakers/${encodeURIComponent(name)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Rename a speaker. The server rejects the call if ``newName`` is already
   * taken. External references to the old name (e.g. saved playgrounds) need
   * to be updated separately.
   */
  async renameSpeaker(
    name: string,
    newName: string,
  ): Promise<SpeakerOperationResponse> {
    return this._http.request<SpeakerOperationResponse>(
      "POST",
      `/v1/speech/audio/speakers/${encodeURIComponent(name)}/rename`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      },
    );
  }

  /**
   * Replace a speaker's reference audio + transcript. The server re-encodes
   * codes for every registered codec.
   */
  async replaceSpeakerAudio(
    name: string,
    audioFile: Blob | File,
    transcript: string,
  ): Promise<SpeakerOperationResponse> {
    const form = new FormData();
    form.append("audio_file", audioFile);
    form.append("transcript", transcript);
    return this._http.request<SpeakerOperationResponse>(
      "PUT",
      `/v1/speech/audio/speakers/${encodeURIComponent(name)}/audio`,
      { body: form },
    );
  }

  /**
   * Fetch a speaker's stored reference audio as a Blob.
   * Useful for inline playback in voice management UIs.
   */
  async getSpeakerAudio(name: string): Promise<Blob> {
    const res = await this._http.request<Response>(
      "GET",
      `/v1/speech/audio/speakers/${encodeURIComponent(name)}/audio`,
      { expectBinary: true },
    );
    return res.blob();
  }
}

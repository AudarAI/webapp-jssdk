import { HttpClient } from "./client";
import {
  ListSpeakersResponse,
  ModelInfo,
  Speaker,
  SpeakerOperationResponse,
  SynthesizeOptions,
  TimedStreamEvent,
  TimedSynthesisResult,
  VoiceMetadata,
} from "./types";

/** Build the shared TTS request body from options. */
function _synthBody(text: string, options: SynthesizeOptions): Record<string, unknown> {
  const { voice, model, response_format, speed,
          temperature, top_p, top_k, seed, min_tokens, max_tokens } = options;
  return {
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
}

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

  /**
   * Synthesize speech WITH句/块级 timing marks (offline). Returns the full audio
   * (base64) plus an ordered list of marks mapping text spans → audio time
   * windows, so a reader UI can highlight the chunk currently being read.
   *
   * Providers without per-chunk timing (e.g. csm) respond HTTP 501.
   */
  async synthesizeTimed(
    text: string,
    options: SynthesizeOptions = {},
  ): Promise<TimedSynthesisResult> {
    const body = { ..._synthBody(text, options), timestamps: true };
    const res = await this._http.request<{
      format: string;
      sample_rate: number;
      duration_ms: number;
      audio_base64: string;
      marks: TimedSynthesisResult["marks"];
    }>("POST", "/v1/speech/audio/speech", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      query: options.provider ? { provider: options.provider } : undefined,
    });
    return {
      format: res.format,
      sampleRate: res.sample_rate,
      durationMs: res.duration_ms,
      audioBase64: res.audio_base64,
      marks: res.marks ?? [],
    };
  }

  /**
   * Streaming synthesis WITH timing marks. Returns an async iterator of NDJSON
   * events: `{type:"mark"|"audio"|"done", ...}`. Each `mark` precedes its
   * chunk's `audio` frames; audio frames are base64-encoded. Feed the audio to
   * a player and use marks to highlight the current chunk.
   *
   * Providers without per-chunk timing (e.g. csm) respond HTTP 501.
   */
  async synthesizeStreamTimed(
    text: string,
    options: SynthesizeOptions = {},
  ): Promise<AsyncGenerator<TimedStreamEvent>> {
    const body = { ..._synthBody(text, options), timestamps: true };
    const res = await this._http.request<Response>("POST", "/v1/speech/audio/speech/stream", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      query: options.provider ? { provider: options.provider } : undefined,
      expectBinary: true,
    });

    async function* parse(): AsyncGenerator<TimedStreamEvent> {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) yield JSON.parse(line) as TimedStreamEvent;
        }
      }
      const tail = buf.trim();
      if (tail) yield JSON.parse(tail) as TimedStreamEvent;
    }

    return parse();
  }

  /** List available TTS models registered in model_management. */
  async listModels(): Promise<ModelInfo[]> {
    return this._http.request<ModelInfo[]>("GET", "/v1/speech/tts/models");
  }

  /**
   * List voices flagged for the official website (public, no auth required).
   * This endpoint does not require authentication.
   *
   * @param model - When set, filters to speakers whose `compatible_models` includes this name.
   */
  async listOfficialSpeakers(model?: string): Promise<Speaker[]> {
    const res = await this._http.requestNoAuth<ListSpeakersResponse>(
      "GET",
      "/v1/speech/audio/official-speakers",
      { query: model ? { model } : undefined },
    );
    return res.speakers ?? [];
  }

  /**
   * List available voices/speakers (names only, kept for backward compatibility).
   *
   * @deprecated Names are not unique — use {@link listSpeakersDetailed} to get
   * `{ id, name }` and address voices by `id`.
   */
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

  /** Delete a custom speaker voice profile by its stable id. */
  async deleteSpeaker(speakerId: string): Promise<SpeakerOperationResponse> {
    return this._http.request<SpeakerOperationResponse>(
      "DELETE",
      `/v1/speech/audio/speakers/${encodeURIComponent(speakerId)}`,
    );
  }

  /**
   * Update a speaker's description, metadata and/or compatible_models without
   * touching the stored reference audio or codes. Any field left ``undefined``
   * is preserved server-side. Pass ``description: ""`` to clear it.
   *
   * @param speakerId - The voice's stable id (from {@link listSpeakersDetailed}).
   */
  async updateSpeaker(
    speakerId: string,
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
      `/v1/speech/audio/speakers/${encodeURIComponent(speakerId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Change a speaker's display name (addressed by id). Names are non-unique,
   * so this never conflicts.
   *
   * @param speakerId - The voice's stable id (from {@link listSpeakersDetailed}).
   */
  async renameSpeaker(
    speakerId: string,
    newName: string,
  ): Promise<SpeakerOperationResponse> {
    return this._http.request<SpeakerOperationResponse>(
      "POST",
      `/v1/speech/audio/speakers/${encodeURIComponent(speakerId)}/rename`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      },
    );
  }

  /**
   * Replace a speaker's reference audio + transcript. The server re-encodes
   * codes for every registered codec.
   *
   * @param speakerId - The voice's stable id (from {@link listSpeakersDetailed}).
   */
  async replaceSpeakerAudio(
    speakerId: string,
    audioFile: Blob | File,
    transcript: string,
  ): Promise<SpeakerOperationResponse> {
    const form = new FormData();
    form.append("audio_file", audioFile);
    form.append("transcript", transcript);
    return this._http.request<SpeakerOperationResponse>(
      "PUT",
      `/v1/speech/audio/speakers/${encodeURIComponent(speakerId)}/audio`,
      { body: form },
    );
  }

  /**
   * Fetch a speaker's stored reference audio as a Blob.
   * Useful for inline playback in voice management UIs.
   *
   * @param speakerId - The voice's stable id (from {@link listSpeakersDetailed}).
   */
  async getSpeakerAudio(speakerId: string): Promise<Blob> {
    const res = await this._http.request<Response>(
      "GET",
      `/v1/speech/audio/speakers/${encodeURIComponent(speakerId)}/audio`,
      { expectBinary: true },
    );
    return res.blob();
  }
}

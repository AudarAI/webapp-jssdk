/**
 * Client-side audio downscaling for ASR uploads.
 *
 * The backend normalises every upload to 16kHz mono 16-bit PCM with ffmpeg
 * before inference, so a 44.1kHz stereo file has ~5.5x of its bytes discarded
 * on arrival. Doing that conversion here instead means the bytes are never sent:
 *
 *   | uploaded as                | bitrate    | fits in 100MB |
 *   | 44.1kHz stereo 16-bit WAV  | 176 KB/s   | ~9.5 min      |
 *   | 16kHz mono 16-bit WAV      |  32 KB/s   | ~52 min       |
 *
 * The output is the same PCM the server would have computed, so this is lossless
 * with respect to the transcription — it is a transport optimisation, not a
 * quality trade-off. It also raises the ceiling imposed by the CDN's request-body
 * cap (100MB on Cloudflare Free/Pro), though it does not remove it; audio longer
 * than ~50 minutes still needs the presigned-upload route.
 *
 * Implemented with Web Audio only — no wasm codec, no new dependency. Outside a
 * browser (or on any failure) every entry point falls back to the original blob,
 * so callers never have to branch on environment.
 */

/** How aggressively to downscale before uploading. */
export type AudioPreprocess =
  /** Convert only when it is likely to matter (default). See `minBytes`. */
  | "auto"
  /** Always convert, regardless of size. */
  | "always"
  /** Never convert; upload the bytes as given. */
  | "never";

export interface TranscodeOptions {
  /** Target sample rate in Hz. Default 16000 — what the ASR models consume. */
  sampleRate?: number;
  /**
   * Under `"auto"`, skip files smaller than this. Default 4MiB.
   *
   * Decoding costs time and a few hundred MB of peak memory on long audio;
   * below this size the upload was never the bottleneck.
   */
  minBytes?: number;
}

export interface TranscodeResult {
  /** What to upload — the converted audio, or the input unchanged. */
  data: Blob;
  /** False when the input was returned as-is. */
  applied: boolean;
  /** Why it was skipped, when `applied` is false. */
  reason?: string;
  originalBytes: number;
  bytes: number;
}

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_MIN_BYTES = 4 * 1024 * 1024;

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineAudioContext(): OfflineCtor | null {
  const g = globalThis as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** True when Web Audio decoding is available (i.e. a browser, not Node). */
export function canTranscodeAudio(): boolean {
  return offlineAudioContext() !== null && typeof Blob !== "undefined";
}

/**
 * Decode `input` and re-encode it as mono 16-bit WAV at `sampleRate`.
 *
 * Decoding happens on a context already running at the target rate, so the
 * browser resamples during decode rather than after. That matters for more than
 * elegance: an hour of 44.1kHz stereo held as float32 is ~1.3GB, while the same
 * hour decoded straight to 16kHz mono is ~230MB.
 *
 * Rejects only on programmer error; codec and memory failures are the caller's
 * to handle via {@link preprocessForAsr}.
 */
export async function transcodeToAsrWav(input: Blob, options: TranscodeOptions = {}): Promise<Blob> {
  const Offline = offlineAudioContext();
  if (!Offline) throw new Error("Web Audio is unavailable in this environment");
  const rate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;

  const bytes = await input.arrayBuffer();

  // length must be >= 1, but is irrelevant here — only sampleRate affects decode.
  let buffer = await new Offline(1, 1, rate).decodeAudioData(bytes);

  // Safari has historically decoded at the file's native rate instead of the
  // context's, so fix up anything that came back wrong rather than trusting it.
  if (buffer.sampleRate !== rate || buffer.numberOfChannels !== 1) {
    buffer = await renderMono(Offline, buffer, rate);
  }

  return encodeWav(buffer.getChannelData(0), rate);
}

/** Resample + downmix via an explicit render pass. */
async function renderMono(Offline: OfflineCtor, buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(buffer.duration * rate));
  const ctx = new Offline(1, frames, rate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // Connecting a multi-channel source to a mono destination applies the
  // spec's down-mix (the channel average), not a silent channel drop.
  source.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/**
 * Wrap float samples in a 44-byte canonical WAV header.
 *
 * Exported for tests: this is the one part of the pipeline that is pure and can
 * be checked without a browser.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const out = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(out);

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true); // file size - 8
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: decoded float samples can exceed [-1, 1] after
    // resampling, and letting those wrap would add clicks the source lacks.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([out], { type: "audio/wav" });
}

/**
 * Decide whether to downscale `input`, and do it if so.
 *
 * Never throws and never rejects: an unsupported environment, an undecodable
 * container, or a codec that runs out of memory all return the original blob
 * with `applied: false` and a `reason`. Uploading the original is always a valid
 * outcome — the server performs the same conversion regardless.
 */
export async function preprocessForAsr(
  input: Blob,
  mode: AudioPreprocess = "auto",
  options: TranscodeOptions = {},
): Promise<TranscodeResult> {
  const originalBytes = input.size;
  const skip = (reason: string): TranscodeResult => ({
    data: input,
    applied: false,
    reason,
    originalBytes,
    bytes: originalBytes,
  });

  if (mode === "never") return skip("disabled");
  if (!canTranscodeAudio()) return skip("Web Audio unavailable");
  if (mode === "auto" && originalBytes < (options.minBytes ?? DEFAULT_MIN_BYTES)) {
    return skip("below minBytes");
  }

  try {
    const data = await transcodeToAsrWav(input, options);
    // A conversion that grew the file is a conversion worth discarding — an
    // already-compressed mp3/opus source is smaller than any PCM we can emit.
    if (data.size >= originalBytes) return skip("no size benefit");
    return { data, applied: true, originalBytes, bytes: data.size };
  } catch (e) {
    return skip(e instanceof Error ? e.message : "transcode failed");
  }
}

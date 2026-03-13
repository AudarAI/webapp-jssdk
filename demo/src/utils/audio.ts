export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  pcm: "audio/wav",
};

export function bufferToObjectUrl(data: ArrayBuffer, format = "mp3"): string {
  const blob = new Blob([data], { type: MIME[format] ?? "audio/mpeg" });
  return URL.createObjectURL(blob);
}

export function downloadBuffer(data: ArrayBuffer, filename: string, format = "mp3") {
  const a = document.createElement("a");
  a.href = bufferToObjectUrl(data, format);
  a.download = filename;
  a.click();
}

export function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16.buffer;
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** Concatenate multiple ArrayBuffers into one. */
export function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(new Uint8Array(b), offset); offset += b.byteLength; }
  return out.buffer;
}

/** Wrap raw PCM (16-bit signed, mono, LE) in a WAV container. */
export function pcmToWav(pcm: ArrayBuffer, sampleRate: number, channels = 1, bitsPerSample = 16): ArrayBuffer {
  const dataLen = pcm.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const s = (o: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + dataLen, true);
  s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bitsPerSample / 8, true);
  v.setUint16(32, channels * bitsPerSample / 8, true); v.setUint16(34, bitsPerSample, true);
  s(36, "data"); v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm));
  return buf;
}

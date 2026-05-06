<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { ModelInfo } from "@audarai/sdk";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import { bufferToObjectUrl, downloadBuffer, fmtSize } from "../utils/audio";
import LogBox from "./LogBox.vue";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Speakers ──────────────────────────────────────────────────────────────────
const speakerNames  = ref<string[]>([]);

async function listSpeakers() {
  clear();
  log("Fetching speaker list...", "info");
  try {
    const list = await client.value!.tts.listSpeakers();
    console.log(list)
    speakerNames.value = list;
    log(`Found ${speakerNames.value.length} speakers`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Synthesize ────────────────────────────────────────────────────────────────
const text          = ref("Hello, this is an AudarAI TTS test.");
const voice         = ref("");
const model         = ref("tts-1");
const format        = ref<"mp3" | "wav" | "opus" | "aac" | "flac" | "pcm">("mp3");
const speed         = ref(1.0);
const synthProvider = ref("");
const audioSrc      = ref("");
const loading       = ref(false);
const audioEl       = ref<HTMLAudioElement | null>(null);

// ── Providers (TTS models) ────────────────────────────────────────────────────
const providerList = ref<ModelInfo[]>([]);

async function listProviders() {
  try {
    const list = await client.value!.tts.listModels();
    providerList.value = list;
    if (!synthProvider.value) {
      synthProvider.value = list.find((m) => m.is_default)?.name ?? "";
    }
  } catch (err) {
    logError(err);
  }
}

watch(client, (c) => { if (c) listProviders(); }, { immediate: true });

function buildOpts() {
  return {
    voice:           voice.value || undefined,
    model:           model.value,
    response_format: format.value,
    speed:           speed.value,
    provider:        synthProvider.value || undefined,
  };
}

async function synthesize() {
  if (!text.value.trim()) { log("Please enter text", "warn"); return; }
  clear();
  loading.value = true;
  log("Synthesizing...", "info");
  try {
    const buf = await client.value!.tts.synthesize(text.value, buildOpts());
    log(`Synthesis complete, size: ${fmtSize(buf.byteLength)}`, "ok");
    audioSrc.value = bufferToObjectUrl(buf, format.value);
    downloadBuffer(buf, `tts_output.${format.value}`, format.value);
  } catch (err) {
    logError(err);
  } finally {
    loading.value = false;
  }
}

const MSE_MIME: Partial<Record<typeof format.value, string>> = {
  mp3: "audio/mpeg",
  aac: "audio/aac",
};

function pickMseMime(fmt: typeof format.value): string | null {
  const mime = MSE_MIME[fmt];
  if (!mime) return null;
  if (typeof MediaSource === "undefined") return null;
  return MediaSource.isTypeSupported(mime) ? mime : null;
}

async function streamWithMse(reader: ReadableStreamDefaultReader<Uint8Array>, mime: string) {
  const ms = new MediaSource();
  audioSrc.value = URL.createObjectURL(ms);
  await nextTick();

  const sb: SourceBuffer = await new Promise((resolve, reject) => {
    ms.addEventListener("sourceopen", () => {
      try { resolve(ms.addSourceBuffer(mime)); } catch (e) { reject(e); }
    }, { once: true });
  });

  const queue: Uint8Array[] = [];
  let started = false;
  let totalBytes = 0;

  const pump = () => {
    if (sb.updating || queue.length === 0) return;
    sb.appendBuffer(queue.shift()!);
  };

  sb.addEventListener("updateend", () => {
    if (!started) {
      started = true;
      audioEl.value?.play().catch(() => {});
    }
    pump();
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    log(`Received chunk ${fmtSize(value.byteLength)}`, "info");
    queue.push(value);
    pump();
  }
  while (queue.length > 0 || sb.updating) {
    await new Promise((r) => setTimeout(r, 30));
  }
  try { ms.endOfStream(); } catch { /* ignore */ }
  log(`Stream complete, total size: ${fmtSize(totalBytes)}`, "ok");
}

async function streamBuffered(reader: ReadableStreamDefaultReader<Uint8Array>, fmt: typeof format.value) {
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    log(`Received chunk ${fmtSize(value.byteLength)}`, "info");
  }
  const total  = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
  log(`Stream complete, total size: ${fmtSize(total)} (format ${fmt} 不支持边收边播,缓冲后播放)`, "ok");
  audioSrc.value = bufferToObjectUrl(merged.buffer, fmt);
  await nextTick();
  audioEl.value?.play().catch(() => {});
}

async function synthesizeStream() {
  if (!text.value.trim()) { log("Please enter text", "warn"); return; }
  clear();
  loading.value = true;
  log("Streaming synthesis...", "info");
  try {
    const fmt  = format.value;
    const mime = pickMseMime(fmt);
    const response = await client.value!.tts.synthesizeStream(text.value, buildOpts());
    const reader = response.body!.getReader();
    if (mime) {
      log(`MSE streaming as ${mime}`, "info");
      await streamWithMse(reader, mime);
    } else {
      await streamBuffered(reader, fmt);
    }
  } catch (err) {
    logError(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <!-- Speakers -->
    <div class="card">
      <h3>Speaker List</h3>
      <div class="row">
        <button class="btn btn-outline" @click="listSpeakers">Fetch Speakers</button>
      </div>
      <div v-if="speakerNames.length" class="speaker-grid">
        <span v-for="name in speakerNames" :key="name" class="speaker-chip">{{ name }}</span>
      </div>
    </div>

    <!-- Synthesize -->
    <div class="card">
      <h3>Synthesize</h3>
      <textarea v-model="text" rows="3" placeholder="Enter text to synthesize..." />

      <div class="row">
        <div class="field">
          <label>voice</label>
          <select v-model="voice">
            <option v-for="name in speakerNames" :key="name" :value="name">{{ name }}</option>
          </select>
        </div>
        <div class="field">
          <label>model</label>
          <select v-model="model">
            <option>tts-1</option><option>tts-1-hd</option>
          </select>
        </div>
        <div class="field">
          <label>format</label>
          <select v-model="format">
            <option>mp3</option><option>wav</option><option>opus</option>
            <option>aac</option><option>flac</option><option>pcm</option>
          </select>
        </div>
        <div class="field">
          <label>speed</label>
          <input v-model.number="speed" type="number" min="0.25" max="4" step="0.05" />
        </div>
        <div class="field">
          <label>provider</label>
          <select v-model="synthProvider">
            <option value="">(default)</option>
            <option v-for="m in providerList" :key="m.name" :value="m.name">{{ m.display_name }}</option>
          </select>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" :disabled="loading" @click="synthesize">Synthesize</button>
        <button class="btn btn-outline" :disabled="loading" @click="synthesizeStream">Stream Synthesize</button>
      </div>

      <audio v-if="audioSrc" ref="audioEl" :src="audioSrc" controls class="audio-player" />
      <LogBox :entries="entries" />
    </div>
  </div>
</template>

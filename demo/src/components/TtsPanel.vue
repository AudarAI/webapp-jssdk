<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ModelInfo, Speaker } from "@audarai/sdk";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import { bufferToObjectUrl, downloadBuffer, fmtSize } from "../utils/audio";
import LogBox from "./LogBox.vue";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Speakers ──────────────────────────────────────────────────────────────────
// SDK 0.3.0+: use listSpeakersDetailed(provider) so we get metadata +
// compatible_models filtering. Falls back to "all speakers" when no provider
// is selected (default model).
const speakers = ref<Speaker[]>([]);
const speakersLoading = ref(false);

async function refreshSpeakers(opts: { silent?: boolean } = {}) {
  if (!client.value) return;
  speakersLoading.value = true;
  if (!opts.silent) log(`Fetching speakers for provider=${synthProvider.value || "(default)"}...`, "info");
  try {
    const list = await client.value.tts.listSpeakersDetailed(synthProvider.value || undefined);
    speakers.value = list;
    if (!opts.silent) log(`Found ${list.length} speakers`, "ok");
    // Re-anchor the voice selector to a valid name when the new list does
    // not contain the previously selected voice.
    const names = list.map((s) => s.name);
    if (!names.includes(voice.value)) {
      voice.value = names[0] ?? "";
    }
  } catch (err) {
    logError(err);
  } finally {
    speakersLoading.value = false;
  }
}

// Manual button handler for the legacy "Fetch Speakers" UX.
async function listSpeakers() {
  clear();
  await refreshSpeakers();
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

watch(client, (c) => {
  if (!c) return;
  // First load: pick a default provider, then pull speakers compatible with it.
  listProviders().then(() => refreshSpeakers({ silent: true }));
}, { immediate: true });

// Auto-refresh speakers when the user switches TTS provider so the voice
// dropdown only shows voices compatible with the selected model.
watch(synthProvider, (next, prev) => {
  if (next === prev) return;
  refreshSpeakers({ silent: true });
});

// Helper for chip/option labels: include 1-2 metadata hints when available.
function speakerLabel(s: Speaker): string {
  const m = s.metadata ?? {};
  const bits: string[] = [];
  if (m.language) bits.push(String(m.language));
  if (m.tone) bits.push(String(m.tone));
  return bits.length ? `${s.name} · ${bits.join(" / ")}` : s.name;
}

const speakerNames = computed(() => speakers.value.map((s) => s.name));

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
      <h3>
        Speaker List
        <small v-if="synthProvider" style="font-weight: normal; color: #888">
          — filtered by provider <code>{{ synthProvider }}</code>
        </small>
      </h3>
      <div class="row">
        <button class="btn btn-outline" :disabled="speakersLoading" @click="listSpeakers">
          {{ speakersLoading ? "Fetching..." : "Fetch Speakers" }}
        </button>
      </div>
      <div v-if="speakers.length" class="speaker-grid">
        <span v-for="s in speakers" :key="s.name" class="speaker-chip" :title="s.description ?? ''">
          {{ speakerLabel(s) }}
        </span>
      </div>
      <div v-else-if="!speakersLoading" style="color: #888; font-size: 0.9em; margin-top: 8px">
        No speakers compatible with the selected provider.
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
            <option v-if="!speakers.length" value="">(no compatible voice)</option>
            <option v-for="s in speakers" :key="s.name" :value="s.name">{{ speakerLabel(s) }}</option>
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

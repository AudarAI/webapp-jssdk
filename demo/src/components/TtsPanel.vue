<script setup lang="ts">
import { ref } from "vue";
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

async function synthesizeStream() {
  if (!text.value.trim()) { log("Please enter text", "warn"); return; }
  clear();
  loading.value = true;
  log("Streaming synthesis...", "info");
  try {
    const response = await client.value!.tts.synthesizeStream(text.value, buildOpts());
    const chunks: Uint8Array[] = [];
    const reader = response.body!.getReader();
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
    log(`Stream complete, total size: ${fmtSize(total)}`, "ok");
    audioSrc.value = bufferToObjectUrl(merged.buffer, format.value);
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
          <input v-model="synthProvider" type="text" placeholder="flash / turbo / pro" />
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" :disabled="loading" @click="synthesize">Synthesize</button>
        <button class="btn btn-outline" :disabled="loading" @click="synthesizeStream">Stream Synthesize</button>
      </div>

      <audio v-if="audioSrc" :src="audioSrc" controls class="audio-player" />
      <LogBox :entries="entries" />
    </div>
  </div>
</template>

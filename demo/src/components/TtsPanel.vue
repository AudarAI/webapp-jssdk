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
  log("获取声音列表...", "info");
  try {
    const list = await client.value!.tts.listSpeakers();
    console.log(list)
    speakerNames.value = list;
    log(`共 ${speakerNames.value.length} 个声音`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Synthesize ────────────────────────────────────────────────────────────────
const text          = ref("你好，这是 AiVox 语音合成测试。");
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
  if (!text.value.trim()) { log("请输入文本", "warn"); return; }
  clear();
  loading.value = true;
  log("合成中...", "info");
  try {
    const buf = await client.value!.tts.synthesize(text.value, buildOpts());
    log(`合成成功，大小: ${fmtSize(buf.byteLength)}`, "ok");
    audioSrc.value = bufferToObjectUrl(buf, format.value);
    downloadBuffer(buf, `tts_output.${format.value}`, format.value);
  } catch (err) {
    logError(err);
  } finally {
    loading.value = false;
  }
}

async function synthesizeStream() {
  if (!text.value.trim()) { log("请输入文本", "warn"); return; }
  clear();
  loading.value = true;
  log("流式合成中...", "info");
  try {
    const response = await client.value!.tts.synthesizeStream(text.value, buildOpts());
    const chunks: Uint8Array[] = [];
    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      log(`收到数据块 ${fmtSize(value.byteLength)}`, "info");
    }
    const total  = chunks.reduce((n, c) => n + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
    log(`流式完成，总大小: ${fmtSize(total)}`, "ok");
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
      <h3>声音列表</h3>
      <div class="row">
        <button class="btn btn-outline" @click="listSpeakers">获取声音列表</button>
      </div>
      <div v-if="speakerNames.length" class="speaker-grid">
        <span v-for="name in speakerNames" :key="name" class="speaker-chip">{{ name }}</span>
      </div>
    </div>

    <!-- Synthesize -->
    <div class="card">
      <h3>合成</h3>
      <textarea v-model="text" rows="3" placeholder="输入要合成的文字..." />

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
        <button class="btn btn-primary" :disabled="loading" @click="synthesize">合成</button>
        <button class="btn btn-outline" :disabled="loading" @click="synthesizeStream">流式合成</button>
      </div>

      <audio v-if="audioSrc" :src="audioSrc" controls class="audio-player" />
      <LogBox :entries="entries" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import { useMicrophone } from "../composables/useMicrophone";
import { bufferToObjectUrl, concatBuffers, pcmToWav, fmtSize } from "../utils/audio";
import type { TranslationWebSocket } from "@audarai/sdk";
import LogBox from "./LogBox.vue";
import DropZone from "./DropZone.vue";

const { client } = useClient();

// ── File translate ────────────────────────────────────────────────────────────
const fileLog    = useLog();
const audioFile  = ref<File | null>(null);
const srcLang    = ref("");
const tgtLang    = ref("en");
const ttsEnabled = ref(true);
const respFormat = ref<"pcm" | "mp3" | "wav">("pcm");
const audioSrc   = ref("");
const loading    = ref(false);

// Recognized / translated text shown live during SSE streaming
const fileSrcText = ref("");
const fileTgtText = ref("");

type FileStage = "" | "stt" | "translating" | "tts" | "done" | "error";
const fileStage = ref<FileStage>("");

async function translate() {
  if (!audioFile.value) { fileLog.log("请选择音频文件", "warn"); return; }
  fileLog.clear();
  audioSrc.value    = "";
  fileSrcText.value = "";
  fileTgtText.value = "";
  fileStage.value   = "stt";
  fileLog.log(`翻译: ${audioFile.value.name} (${fmtSize(audioFile.value.size)})`, "info");
  loading.value = true;

  const fileTtsChunks: ArrayBuffer[] = [];
  let fileTtsFormat     = "pcm";
  let fileTtsSampleRate = 24000;

  try {
    const result = await client.value!.translation.translate(
      audioFile.value,
      {
        target_lang:     tgtLang.value,
        source_lang:     srcLang.value || undefined,
        tts_enabled:     ttsEnabled.value,
        response_format: ttsEnabled.value ? respFormat.value : undefined,
      },
      {
        onStatus: ({ stage, message }) => {
          fileLog.log(`[status] stage=${stage} ${message}`, "info");
        },
        onSttPartial: ({ text, language, chunk_index }) => {
          fileLog.log(`[stt_partial] chunk${chunk_index} [${language}] ${text}`);
          fileStage.value   = "stt";
          fileSrcText.value = text;
        },
        onSttFinal: ({ text, language, duration }) => {
          fileLog.log(`[stt_final] [${language}] dur=${duration}s: ${text}`, "info");
          fileStage.value   = "translating";
          fileSrcText.value = text;
        },
        onTranslationPartial: ({ text, target_lang }) => {
          fileLog.log(`[translation_partial] [${target_lang}] ${text}`);
          fileStage.value   = "translating";
          fileTgtText.value = text;
        },
        onTranslationComplete: ({ text, source_lang, target_lang }) => {
          fileLog.log(`[translation_complete] ${source_lang}→${target_lang}: ${text}`, "ok");
          fileStage.value   = "tts";
          fileTgtText.value = text;
        },
        onTtsChunk: (audio, { format, sample_rate, chunk_index }) => {
          fileTtsChunks.push(audio);
          fileTtsFormat     = format;
          fileTtsSampleRate = sample_rate;
          fileStage.value   = "tts";
          fileLog.log(`[tts_chunk] chunk${chunk_index} ${fmtSize(audio.byteLength)} ${format}@${sample_rate}Hz`, "info");
        },
        onTtsComplete: ({ total_chunks }) => {
          fileLog.log(`[tts_complete] total_chunks=${total_chunks}`, "info");
        },
        onPipelineComplete: ({ source_text, translated_text }) => {
          fileLog.log(`[pipeline_complete] src="${source_text}" → tgt="${translated_text}"`, "ok");
          fileStage.value = "done";
        },
        onError: ({ stage, message }) => {
          fileLog.log(`[error] stage=${stage}: ${message}`, "err");
          fileStage.value = "error";
        },
      },
    );

    fileLog.log(`[result] source_text="${result.source_text}" text="${result.text}" source_lang=${result.source_lang} target_lang=${result.target_lang}`, "info");

    // Fallback to result fields if SSE handlers didn't fire
    if (!fileSrcText.value) fileSrcText.value = result.source_text;
    if (!fileTgtText.value) fileTgtText.value = result.text;

    if (fileTtsChunks.length) {
      const merged   = concatBuffers(fileTtsChunks);
      const playable = fileTtsFormat === "pcm" ? pcmToWav(merged, fileTtsSampleRate) : merged;
      audioSrc.value = bufferToObjectUrl(playable, fileTtsFormat === "pcm" ? "wav" : fileTtsFormat);
      fileLog.log(`翻译+合成成功，共 ${fileTtsChunks.length} 块，格式 ${fileTtsFormat}@${fileTtsSampleRate}Hz`, "ok");
    } else {
      fileLog.log(`翻译成功（无 TTS 音频）`, "ok");
    }
    if (result.source_lang) fileLog.log(`源语言: ${result.source_lang}`);
    fileLog.log(`目标语言: ${result.target_lang}`);
  } catch (err) {
    fileStage.value = "error";
    fileLog.logError(err);
  } finally {
    loading.value = false;
  }
}

// ── WebSocket 实时翻译 ─────────────────────────────────────────────────────────
// Protocol:
//   Client → Server: PCM binary frames (16kHz/16-bit/mono) | {"type":"stop"}
//   Server → Client: ready | stt_partial | stt_segment | translation_complete
//                  | tts_chunk (base64 audio, SDK auto-decodes to ArrayBuffer)
//                  | segment_complete | pipeline_complete | error

type WsState = "idle" | "connecting" | "connected";

const wsLog      = useLog();
const wsSrc      = ref("zh");
const wsTgt      = ref("en");
const wsMode     = ref<"llm" | "mt">("llm");
const wsTts      = ref(true);
const wsFormat   = ref<"pcm" | "mp3" | "wav">("pcm");
const wsState       = ref<WsState>("idle");
const segAudioSrc   = ref("");  // 当前段落完成后实时播放
const finalAudioSrc = ref("");  // pipeline_complete 后的完整音频

// Subtitle state: live partial + accumulated finalized segments
const sttPartial = ref("");

interface SegmentEntry { original: string; translated: string; }
const segments = ref<SegmentEntry[]>([]);

let translationWs: TranslationWebSocket | null = null;

// TTS chunk accumulator: segment_index → ArrayBuffer[]
let ttsChunks: Map<number, ArrayBuffer[]> = new Map();
let ttsFormat     = "pcm";
let ttsSampleRate = 24000;

const mic = useMicrophone((pcm) => translationWs?.sendAudio(pcm));

async function startWs() {
  wsLog.clear();
  sttPartial.value = "";
  segments.value   = [];
  ttsChunks = new Map();
  ttsFormat = "pcm";
  ttsSampleRate = 24000;
  segAudioSrc.value   = "";
  finalAudioSrc.value = "";
  wsState.value = "connecting";

  try {
    translationWs = await client.value!.translation.connectWebSocket(
      {
        target_lang:      wsTgt.value,
        source_lang:      wsSrc.value || undefined,
        translation_mode: wsMode.value,
        tts_enabled:      wsTts.value,
        response_format:  wsTts.value ? wsFormat.value : undefined,
      },
      {
        // 连接成功（服务端发 ready）→ 启动麦克风
        onReady: async ({ session_id }) => {
          wsState.value = "connected";
          wsLog.log(`会话已就绪 session_id=${session_id}，开始录音`, "ok");
          await mic.start();
        },

        // 实时转写中间结果
        onSttPartial: ({ text, language, segment }) => {
          sttPartial.value = text;
          wsLog.log(`… [seg${segment}][${language}] ${text}`);
        },

        // 段落转写最终结果 — 推入积累列表，不替换
        onSttSegment: ({ text, language, segment_index }) => {
          sttPartial.value = "";
          segments.value.push({ original: text, translated: "" });
          wsLog.log(`✓ 转写 [seg${segment_index}][${language}] ${text}`, "info");
        },

        // 翻译完成 — 更新对应段落的 translated 字段
        onTranslationComplete: ({ text, source_lang, target_lang, segment_index }) => {
          const entry = segments.value[segment_index];
          if (entry) entry.translated = text;
          else segments.value.push({ original: "", translated: text });
          wsLog.log(`✓ 翻译 [seg${segment_index}] ${source_lang}→${target_lang}: ${text}`, "ok");
        },

        // TTS 音频块 (SDK 已自动 base64 解码为 ArrayBuffer)，按段落分组缓存
        onTtsChunk: (audio, { format, sample_rate, chunk_index, segment_index }) => {
          if (!ttsChunks.has(segment_index)) ttsChunks.set(segment_index, []);
          ttsChunks.get(segment_index)!.push(audio);
          ttsFormat     = format;
          ttsSampleRate = sample_rate;
          wsLog.log(`  tts_chunk [seg${segment_index}][chunk${chunk_index}] ${fmtSize(audio.byteLength)} ${format}@${sample_rate}Hz`, "info");
        },

        // 整个段落全部完成 → 合并本段音频并实时播放
        onSegmentComplete: ({ segment_index, source_text, translated_text }) => {
          wsLog.log(`✓ 段落${segment_index}完成: "${source_text}" → "${translated_text}"`, "ok");
          const chunks = ttsChunks.get(segment_index) ?? [];
          if (chunks.length) {
            const merged  = concatBuffers(chunks);
            const playable = ttsFormat === "pcm" ? pcmToWav(merged, ttsSampleRate) : merged;
            segAudioSrc.value = bufferToObjectUrl(playable, ttsFormat === "pcm" ? "wav" : ttsFormat);
          }
        },

        // 全部处理完成 → 合并所有段落音频为完整文件
        onPipelineComplete: ({ duration }) => {
          wsLog.log(`✓ Pipeline 完成，总耗时 ${duration}s`, "ok");
          const all: ArrayBuffer[] = [];
          [...ttsChunks.entries()]
            .sort(([a], [b]) => a - b)
            .forEach(([, chunks]) => all.push(...chunks));
          if (all.length) {
            const merged   = concatBuffers(all);
            const playable = ttsFormat === "pcm" ? pcmToWav(merged, ttsSampleRate) : merged;
            finalAudioSrc.value = bufferToObjectUrl(playable, ttsFormat === "pcm" ? "wav" : ttsFormat);
          }
        },

        // 错误（单个段落出错，流水线继续）
        onError: ({ message, stage, segment_index }) => {
          const where = stage ? `[${stage}]` : "";
          const seg   = segment_index != null ? `[seg${segment_index}]` : "";
          wsLog.log(`错误 ${where}${seg}: ${message}`, "err");
        },

        onClose: () => {
          wsLog.log("连接已关闭", "warn");
          cleanup();
        },
      }
    );
  } catch (err) {
    wsLog.logError(err);
    wsState.value = "idle";
  }
}

function stopWs() {
  translationWs?.stop(); // {"type":"stop"} → server processes remaining audio then closes
  mic.stop();
  wsLog.log("已发送停止信号，等待服务端处理剩余数据...", "warn");
  // Don't reset wsState yet — wait for pipeline_complete + onClose
}

function cleanup() {
  mic.stop();
  translationWs = null;
  wsState.value = "idle";
}
</script>

<template>
  <div>
    <!-- File translate -->
    <div class="card">
      <h3>文件翻译</h3>
      <DropZone v-model="audioFile" />
      <div class="row">
        <div class="field">
          <label>source_lang</label>
          <input v-model="srcLang" type="text" placeholder="自动检测" />
        </div>
        <div class="field">
          <label>target_lang *</label>
          <input v-model="tgtLang" type="text" />
        </div>
        <div class="field">
          <label>tts_enabled</label>
          <select v-model="ttsEnabled">
            <option :value="true">true（返回音频）</option>
            <option :value="false">false（返回文字）</option>
          </select>
        </div>
        <div class="field">
          <label>format</label>
          <select v-model="respFormat">
            <option>pcm</option><option>mp3</option><option>wav</option>
          </select>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" :disabled="loading" @click="translate">翻译</button>
      </div>

      <!-- Pipeline stage status bar -->
      <div v-if="fileStage" class="pipeline-status">
        <span
          v-for="s in (['stt', 'translating', 'tts', 'done'] as const)"
          :key="s"
          class="stage-step"
          :class="{
            active:  fileStage === s,
            passed:  fileStage === 'done' || (fileStage !== 'error' && ['stt','translating','tts','done'].indexOf(fileStage) > ['stt','translating','tts','done'].indexOf(s)),
            error:   fileStage === 'error',
          }"
        >{{ { stt: '识别', translating: '翻译', tts: '合成', done: '完成' }[s] }}</span>
        <span v-if="fileStage === 'error'" class="stage-step error active">失败</span>
      </div>

      <!-- Live STT / translation text -->
      <div v-if="fileSrcText || fileTgtText" class="subtitle-box" style="margin-bottom:12px">
        <div v-if="fileSrcText" class="subtitle-original">{{ fileSrcText }}</div>
        <div v-if="fileTgtText" class="subtitle-translated">{{ fileTgtText }}</div>
      </div>

      <!-- TTS audio player -->
      <audio v-if="audioSrc" :src="audioSrc" controls class="audio-player" />
      <LogBox :entries="fileLog.entries.value" />
    </div>

    <!-- WebSocket mic -->
    <div class="card">
      <h3>
        <span class="ws-dot" :class="wsState" />
        实时翻译（WebSocket + 麦克风）
        <span class="ws-state-label" :class="wsState">
          {{ { idle: '', connecting: '连接中…', connected: '录音中' }[wsState] }}
        </span>
      </h3>

      <details class="proto-info">
        <summary>协议说明（STT → 翻译 → TTS 三级流水线）</summary>
        <ul>
          <li>连接后服务端发 <code>ready</code>，此时开始录音</li>
          <li>静音 0.8s 或段落超 15s 时触发段落切割</li>
          <li><code>stt_partial</code> → <code>stt_segment</code> → <code>translation_complete</code> → <code>tts_chunk</code> × N → <code>segment_complete</code></li>
          <li>发送 <code>{"type":"stop"}</code> 后服务端处理剩余数据，完成后发 <code>pipeline_complete</code> 并关闭</li>
        </ul>
      </details>

      <div class="row">
        <div class="field">
          <label>source_lang</label>
          <input v-model="wsSrc" type="text" />
        </div>
        <div class="field">
          <label>target_lang</label>
          <input v-model="wsTgt" type="text" />
        </div>
        <div class="field">
          <label>tts_enabled</label>
          <select v-model="wsTts">
            <option :value="true">true</option>
            <option :value="false">false</option>
          </select>
        </div>
        <div class="field">
          <label>format</label>
          <select v-model="wsFormat">
            <option>pcm</option><option>mp3</option><option>wav</option>
          </select>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" :disabled="wsState !== 'idle'" @click="startWs">开始录音</button>
        <button class="btn btn-danger"  :disabled="wsState === 'idle'"  @click="stopWs">停止</button>
      </div>

      <!-- Subtitle overlay -->
      <div v-if="wsState === 'connected' || segments.length > 0" class="subtitle-box">
        <!-- All finalized segment pairs (accumulated) -->
        <div v-for="(seg, i) in segments" :key="i" class="segment-entry">
          <div class="subtitle-original">{{ seg.original }}</div>
          <div v-if="seg.translated" class="subtitle-translated">{{ seg.translated }}</div>
        </div>
        <!-- Live partial of the segment currently being spoken -->
        <div v-if="sttPartial" class="partial-text">{{ sttPartial }}</div>
        <div v-else-if="wsState === 'connected'" class="partial-text muted">等待语音输入...</div>
      </div>

      <!-- 段落完成后实时播放 -->
      <audio v-if="segAudioSrc" :key="segAudioSrc" :src="segAudioSrc" controls class="audio-player" />

      <!-- Pipeline 完成后的完整合并音频 -->
      <div v-if="finalAudioSrc" style="margin-bottom:12px">
        <div style="font-size:12px;color:#888;margin-bottom:4px">完整翻译音频</div>
        <audio :src="finalAudioSrc" controls class="audio-player" />
      </div>

      <LogBox :entries="wsLog.entries.value" />
    </div>
  </div>
</template>

<style scoped>
/* ── Pipeline stage bar ──────────────────────────────────────────────────────── */
.pipeline-status {
  display: flex;
  align-items: center;
  gap: 0;
  margin: 10px 0 14px;
}

.stage-step {
  position: relative;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #888;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-right: none;
  transition: background 0.2s, color 0.2s;
}
.stage-step:first-child { border-radius: 4px 0 0 4px; }
.stage-step:last-child  { border-radius: 0 4px 4px 0; border-right: 1px solid #ddd; }

.stage-step.passed {
  background: #d4edda;
  color: #2e7d32;
  border-color: #a5d6a7;
}
.stage-step.active {
  background: #1976d2;
  color: #fff;
  border-color: #1565c0;
  animation: pulse 1.2s ease-in-out infinite;
}
.stage-step.error {
  background: #fdecea;
  color: #c62828;
  border-color: #ef9a9a;
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.65; }
}

/* ── Segment entry (original + translation pair) ────────────────────────────── */
.segment-entry {
  padding: 6px 0;
  border-bottom: 1px solid #2a2a2e;
}
.segment-entry:last-child { border-bottom: none; }

/* ── WebSocket state label ───────────────────────────────────────────────────── */
.ws-state-label {
  font-size: 12px;
  font-weight: 400;
  margin-left: 6px;
  vertical-align: middle;
}
.ws-state-label.connecting { color: #f59e0b; }
.ws-state-label.connected  { color: #16a34a; }
</style>

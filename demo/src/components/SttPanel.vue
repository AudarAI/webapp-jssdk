<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import { useMicrophone } from "../composables/useMicrophone";
import { fmtSize } from "../utils/audio";
import type { SttWebSocket, SttErrorMessage } from "@audarai/sdk";
import LogBox from "./LogBox.vue";
import DropZone from "./DropZone.vue";

const { client } = useClient();

// ── File transcribe ───────────────────────────────────────────────────────────
const fileLog   = useLog();
const audioFile = ref<File | null>(null);
const sttLang   = ref("");
const sttProv   = ref("");
const loading   = ref(false);
const result = ref("");

async function transcribe() {
  if (!audioFile.value) { fileLog.log("请选择音频文件", "warn"); return; }
  fileLog.clear();
  result.value = "";
  fileLog.log(`转写: ${audioFile.value.name} (${fmtSize(audioFile.value.size)})`, "info");
  loading.value = true;
  try {
    const res = await client.value!.stt.transcribe(audioFile.value, {
      language: sttLang.value || undefined,
      provider: sttProv.value || undefined,
    });
    result.value = res.text;
    if (res.language) fileLog.log(`语言: ${res.language}`);
    if (res.timestamps?.length) {
      fileLog.log(`时间戳 (${res.timestamps.length} 条):`);
      res.timestamps.slice(0, 10).forEach((t) =>
        fileLog.log(`  [${t.start_time.toFixed(2)}s – ${t.end_time.toFixed(2)}s]  ${t.text}`)
      );
      if (res.timestamps.length > 10)
        fileLog.log(`  ...还有 ${res.timestamps.length - 10} 条`);
    }
  } catch (err) {
    fileLog.logError(err);
  } finally {
    loading.value = false;
  }
}

async function transcribeStream() {
  if (!audioFile.value) { fileLog.log("请选择音频文件", "warn"); return; }
  fileLog.clear();
  result.value = "";
  fileLog.log(`SSE 流式转写: ${audioFile.value.name}`, "info");
  loading.value = true;
  try {
    const res = await client.value!.stt.transcribeStream(
      audioFile.value,
      {
        language: sttLang.value || undefined,
        provider: sttProv.value || undefined,
      },
      {
        onChunk: ({ text, language, is_final, chunk_index }) => {
          result.value = text;
          fileLog.log(`chunk${chunk_index} [${language}]${is_final ? " [final]" : ""}: ${text}`);
        },
        onFinal: ({ text, language }) => {
          result.value = text;
          fileLog.log(`最终结果 [${language}]: ${text}`, "ok");
        },
        onError: (err) => {
          fileLog.log(`错误: ${err.message}`, "err");
        },
      },
    );
    if (!result.value) result.value = res.text;
    fileLog.log("SSE 结束", "ok");
  } catch (err) {
    fileLog.logError(err);
  } finally {
    loading.value = false;
  }
}

// ── WebSocket 实时转写 (v2 协议) ───────────────────────────────────────────────
// 握手流程：
//   连接建立 → 服务端发 ready → SDK 自动回 {"type":"start"} → 开始发 PCM 帧
//   发送 {"type":"stop"} → 服务端刷新剩余，依次发 segment / final → 关闭连接
//
// 服务端消息：
//   ready   : {type, session_id, language}
//   partial : {type, text, language, segment}           (~120ms 节流，实时中间结果)
//   segment : {type, segment_index, text, language, audio_duration, reason}  (段落完结)
//   final   : {type, text, language, duration}           (全部完成)
//   error   : {type, message}

type WsState = "idle" | "connecting" | "connected";

const wsLog   = useLog();
const wsLang  = ref("zh");
const wsProv  = ref("");
const wsState = ref<WsState>("idle");

// 实时字幕（随 partial 更新，segment 时固化）
const partialText  = ref("");
const segmentLogs  = ref<string[]>([]);

let sttWs: SttWebSocket | null = null;

// 麦克风：每帧 PCM 直接转发给 SttWebSocket.sendAudio()
const mic = useMicrophone((pcm) => sttWs?.sendAudio(pcm));

async function startWs() {
  wsLog.clear();
  partialText.value = "";
  segmentLogs.value = [];
  wsState.value = "connecting";

  try {
    sttWs = await client.value!.stt.connectWebSocket(
      {
        language: wsLang.value || undefined,
        provider: wsProv.value || undefined,
      },
      {
        // 服务端就绪，SDK 已自动回 {"type":"start"}，此时启动麦克风
        onReady: async ({ session_id, language }) => {
          wsState.value = "connected";
          wsLog.log(`会话就绪  session_id=${session_id}  language=${language}`, "ok");
          wsLog.log("开始录音，等待语音输入...", "info");
          await mic.start();
        },

        // 实时中间结果（~120ms 节流）
        onPartial: ({ text, language, segment }) => {
          partialText.value = text;
          wsLog.log(`… seg${segment} [${language}] ${text}`);
        },

        // 段落转写完成（VAD 切割 或 超 15s）
        onSegment: ({ segment_index, text, language, audio_duration, reason }) => {
          partialText.value = "";
          const entry = `✓ seg${segment_index} [${language}] ${text}  (${audio_duration.toFixed(1)}s, ${reason})`;
          segmentLogs.value.push(entry);
          wsLog.log(entry, "ok");
        },

        // 全部处理完成（stop 之后服务端发）
        onFinal: ({ text, language, duration }) => {
          wsLog.log(`✓ 最终结果 [${language}]: ${text}  (总时长 ${duration.toFixed(1)}s)`, "ok");
          cleanup();
        },

        // 流水线错误（不一定致命）
        onError: (e) => {
          const msg = (e as SttErrorMessage).message ?? "WebSocket 错误";
          wsLog.log(msg, "err");
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
  sttWs?.stop();   // 发 {"type":"stop"}，服务端处理完剩余后关闭
  mic.stop();
  wsLog.log("已发送停止信号，等待服务端最终结果...", "warn");
}

function cleanup() {
  mic.stop();
  sttWs = null;
  wsState.value = "idle";
  partialText.value = "";
}
</script>

<template>
  <div>
    <!-- File transcribe -->
    <div class="card">
      <h3>文件转写</h3>
      <DropZone v-model="audioFile" />
      <div class="row">
        <div class="field">
          <label>language</label>
          <input v-model="sttLang" type="text" placeholder="zh / en ..." />
        </div>
        <div class="field">
          <label>provider</label>
          <input v-model="sttProv" type="text" placeholder="flash / turbo" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" :disabled="loading" @click="transcribe">转写</button>
        <button class="btn btn-outline" :disabled="loading" @click="transcribeStream">SSE 流式</button>
      </div>
      <textarea v-if="result" :value="result" readonly rows="4" class="result-box" />
      <LogBox :entries="fileLog.entries.value" />
    </div>

    <!-- WebSocket mic -->
    <div class="card">
      <h3>
        <span class="ws-dot" :class="wsState" />
        实时转写（WebSocket + 麦克风）— v2 协议
      </h3>

      <details class="proto-info">
        <summary>协议握手流程</summary>
        <ul>
          <li>连接建立 → 服务端发 <code>ready</code> → SDK 自动回 <code>{"type":"start"}</code></li>
          <li>客户端持续发送 PCM 二进制帧（16kHz / 16-bit signed / mono LE）</li>
          <li>VAD 静音 ≥0.8s 或段落 ≥15s → 服务端发 <code>partial</code> / <code>segment</code></li>
          <li>发送 <code>{"type":"stop"}</code> → 服务端发 <code>segment</code> + <code>final</code> 后关闭</li>
        </ul>
      </details>

      <div class="row">
        <div class="field">
          <label>language</label>
          <input v-model="wsLang" type="text" />
        </div>
        <div class="field">
          <label>provider</label>
          <input v-model="wsProv" type="text" placeholder="flash / turbo" />
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" :disabled="wsState !== 'idle'" @click="startWs">开始录音</button>
        <button class="btn btn-danger"  :disabled="wsState === 'idle'"  @click="stopWs">停止</button>
      </div>

      <!-- 实时字幕 -->
      <div v-if="wsState === 'connected' || segmentLogs.length > 0" class="subtitle-box">
        <div v-for="(s, i) in segmentLogs" :key="i" class="subtitle-original">{{ s }}</div>
        <div v-if="partialText" class="partial-text">{{ partialText }}</div>
        <div v-else-if="wsState === 'connected'" class="partial-text muted">等待语音输入...</div>
      </div>

      <LogBox :entries="wsLog.entries.value" />
    </div>
  </div>
</template>

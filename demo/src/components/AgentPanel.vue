<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { AgentResponse, SessionResponse, MessageResponse } from "@aivox/sdk";
import { Room, RoomEvent, Track, type TranscriptionSegment, type Participant } from "livekit-client";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Agents ─────────────────────────────────────────────────────────────
const agents = ref<AgentResponse[]>([]);

const newAgent = ref({
  name: "",
  description: "",
  system_prompt: "",
  voice: "",
  model: "",
  language: "",
});

async function listAgents() {
  log("获取 Agent 列表...", "info");
  try {
    agents.value = await client.value!.agent.listAgents();
    log(`共 ${agents.value.length} 个 Agent`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function createAgent() {
  if (!newAgent.value.name.trim()) { log("请填写 Agent 名称", "warn"); return; }
  log(`创建 Agent: ${newAgent.value.name}...`, "info");
  try {
    const created = await client.value!.agent.createAgent({
      name: newAgent.value.name,
      description: newAgent.value.description || undefined,
      system_prompt: newAgent.value.system_prompt || undefined,
      voice: newAgent.value.voice || undefined,
      model: newAgent.value.model || undefined,
      language: newAgent.value.language || undefined,
    });
    agents.value.push(created);
    log(`Agent 创建成功: ${created.id}`, "ok");
    newAgent.value = { name: "", description: "", system_prompt: "", voice: "", model: "", language: "" };
  } catch (err) {
    logError(err);
  }
}

async function deleteAgent(id: string) {
  log(`删除 Agent: ${id}...`, "info");
  try {
    await client.value!.agent.deleteAgent(id);
    agents.value = agents.value.filter(a => a.id !== id);
    log("删除成功", "ok");
    if (chatAgentId.value === id) chatAgentId.value = "";
  } catch (err) {
    logError(err);
  }
}

// ── Card 2: Chat ───────────────────────────────────────────────────────────────
const chatAgentId = ref("");
const chatMessage = ref("你好");
const chatSessionId = ref("");
const chatRoomId = ref("");
const livekitToken = ref<Record<string, unknown> | null>(null);

async function startChat() {
  if (!chatAgentId.value) { log("请选择 Agent", "warn"); return; }
  if (!chatMessage.value.trim()) { log("请输入消息", "warn"); return; }
  log(`发起 Chat (agent=${chatAgentId.value})...`, "info");
  try {
    const res = await client.value!.agent.chat(chatAgentId.value, chatMessage.value);
    chatSessionId.value = res.session_id;
    chatRoomId.value = res.room_id;
    sessionId.value = res.session_id;
    msgSessionId.value = res.session_id;
    livekitToken.value = null;
    log(`Chat 成功 — session_id: ${res.session_id}`, "ok");
    await loadMessages();
  } catch (err) {
    logError(err);
  }
}

async function getLiveKitToken() {
  if (!chatSessionId.value) { log("请先发起 Chat", "warn"); return; }
  log("获取 LiveKit Token...", "info");
  try {
    const res = await client.value!.agent.getLiveKitToken(chatSessionId.value);
    livekitToken.value = res as unknown as Record<string, unknown>;
    log("Token 获取成功", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 3: Session 管理 ───────────────────────────────────────────────────────
const sessionId = ref("");
const sessionDetail = ref<SessionResponse | null>(null);

async function getSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log(`获取 Session 详情: ${sessionId.value}...`, "info");
  try {
    sessionDetail.value = await client.value!.agent.getSession(sessionId.value);
    log(`状态: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function pauseSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("暂停 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.pauseSession(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function resumeSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("恢复 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.resumeSession(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function endSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("结束 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.endSession(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 4: 消息记录 ────────────────────────────────────────────────────────────
const msgSessionId = ref("");
const messages = ref<MessageResponse[]>([]);
const appendRole = ref<"user" | "assistant" | "system">("user");
const appendContent = ref("");

async function loadMessages() {
  if (!msgSessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("加载消息...", "info");
  try {
    const res = await client.value!.agent.listMessages(msgSessionId.value);
    // Backend may return a flat array or a {messages, total} wrapper
    messages.value = res.data ?? [];
    const total = res.total ?? messages.value.length;
    log(`共 ${total} 条消息`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 5: 语音对话 ────────────────────────────────────────────────────────────
type VoiceState = "idle" | "connecting" | "connected" | "disconnecting";

const voiceAgentId  = ref("");
const voiceInitMsg  = ref("你好");
const voiceState    = ref<VoiceState>("idle");
const voiceSessionId = ref("");
const micEnabled    = ref(true);
const agentSpeaking = ref(false);
const localSpeaking = ref(false);
const audioEl       = ref<HTMLAudioElement | null>(null);

interface SubtitleLine { id: string; text: string; role: "user" | "agent"; final: boolean }
const subtitleLines = ref<SubtitleLine[]>([]);
const MAX_FINAL_SUBTITLES = 10;

let _room: Room | null = null;

function teardownRoom() {
  if (_room) {
    _room.removeAllListeners();
    _room = null;
  }
  agentSpeaking.value = false;
  localSpeaking.value = false;
  voiceState.value = "idle";
}

async function startVoice() {
  if (!voiceAgentId.value) { log("请选择 Agent", "warn"); return; }
  voiceState.value = "connecting";
  log("发起语音对话...", "info");
  try {
    const chatRes = await client.value!.agent.chat(
      voiceAgentId.value,
      voiceInitMsg.value || "你好",
    );
    voiceSessionId.value = chatRes.session_id;
    log(`Session: ${chatRes.session_id}`, "info");

    const tokenRes = await client.value!.agent.getLiveKitToken(chatRes.session_id);
    log(`获取 LiveKit Token 成功`, "info");

    const room = new Room({
      adaptiveStream: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    _room = room;

    room.on(RoomEvent.Connected, () => {
      voiceState.value = "connected";
      log("已连接到语音房间", "ok");
    });

    room.on(RoomEvent.Disconnected, () => {
      log("语音连接已断开", "info");
      teardownRoom();
    });

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio && audioEl.value) {
        track.attach(audioEl.value);
        log("收到 Agent 音频流", "ok");
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const localId = room.localParticipant.identity;
      localSpeaking.value  = speakers.some(s => s.identity === localId);
      agentSpeaking.value  = speakers.some(s => s.identity !== localId);
    });

    room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
      const role = participant?.identity === room.localParticipant.identity ? "user" : "agent";
      for (const seg of segments) {
        const idx = subtitleLines.value.findIndex(l => l.id === seg.id);
        if (idx >= 0) {
          subtitleLines.value[idx] = { id: seg.id, text: seg.text, role, final: seg.final };
        } else {
          subtitleLines.value.push({ id: seg.id, text: seg.text, role, final: seg.final });
        }
      }
      // Keep last MAX_FINAL_SUBTITLES final lines + all live (non-final) lines
      const finals = subtitleLines.value.filter(l => l.final).slice(-MAX_FINAL_SUBTITLES);
      const lives  = subtitleLines.value.filter(l => !l.final);
      subtitleLines.value = [...finals, ...lives];
    });

    subtitleLines.value = [];
    await room.connect(tokenRes.livekit_url, tokenRes.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    micEnabled.value = true;
  } catch (err) {
    teardownRoom();
    logError(err);
  }
}

async function toggleMic() {
  if (!_room) return;
  micEnabled.value = !micEnabled.value;
  await _room.localParticipant.setMicrophoneEnabled(micEnabled.value);
  log(micEnabled.value ? "麦克风已开启" : "已静音", "info");
}

async function stopVoice() {
  if (!_room) return;
  voiceState.value = "disconnecting";
  await _room.disconnect();
}

onUnmounted(() => { _room?.disconnect(); });

async function appendMessage() {
  if (!msgSessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  if (!appendContent.value.trim()) { log("请输入消息内容", "warn"); return; }
  log("追加消息...", "info");
  try {
    const msg = await client.value!.agent.appendMessage(msgSessionId.value, {
      role: appendRole.value,
      content: appendContent.value,
    });
    messages.value.push(msg);
    appendContent.value = "";
    log(`消息已追加: ${msg.id}`, "ok");
  } catch (err) {
    logError(err);
  }
}
</script>

<template>
  <div>
    <!-- Card 1: Agents -->
    <div class="card">
      <h3>Agents</h3>
      <div class="row">
        <button class="btn btn-outline" @click="listAgents">获取 Agent 列表</button>
      </div>

      <table v-if="agents.length" class="agent-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>语言</th>
            <th>模型</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in agents" :key="agent.id">
            <td class="id-cell" :title="agent.id">{{ agent.id.slice(0, 8) }}…</td>
            <td>{{ agent.name }}</td>
            <td>{{ agent.language ?? "—" }}</td>
            <td>{{ agent.model ?? "—" }}</td>
            <td>{{ new Date(agent.created_at).toLocaleString() }}</td>
            <td>
              <button class="btn btn-sm btn-danger" @click="deleteAgent(agent.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="sub-section">
        <h4>创建 Agent</h4>
        <div class="row">
          <div class="field">
            <label>名称 *</label>
            <input v-model="newAgent.name" type="text" placeholder="My Agent" />
          </div>
          <div class="field">
            <label>language</label>
            <input v-model="newAgent.language" type="text" placeholder="zh-CN" />
          </div>
          <div class="field">
            <label>model</label>
            <input v-model="newAgent.model" type="text" placeholder="gpt-4o" />
          </div>
          <div class="field">
            <label>voice</label>
            <input v-model="newAgent.voice" type="text" placeholder="alloy" />
          </div>
        </div>
        <div class="field">
          <label>description</label>
          <input v-model="newAgent.description" type="text" placeholder="可选描述" />
        </div>
        <div class="field">
          <label>system_prompt</label>
          <textarea v-model="newAgent.system_prompt" rows="2" placeholder="系统提示词（可选）" />
        </div>
        <button class="btn btn-primary" @click="createAgent">创建 Agent</button>
      </div>
    </div>

    <!-- Card 2: Chat -->
    <div class="card">
      <h3>Chat（快速发起会话）</h3>
      <div class="row">
        <div class="field">
          <label>选择 Agent</label>
          <select v-model="chatAgentId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field" style="flex:2">
          <label>消息</label>
          <input v-model="chatMessage" type="text" placeholder="你好" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" @click="startChat">发起 Chat</button>
        <button class="btn btn-outline" :disabled="!chatSessionId" @click="getLiveKitToken">获取 LiveKit Token</button>
      </div>

      <div v-if="chatSessionId" class="result-box">
        <div><strong>session_id:</strong> {{ chatSessionId }}</div>
        <div><strong>room_id:</strong> {{ chatRoomId }}</div>
      </div>

      <div v-if="livekitToken" class="result-box">
        <pre>{{ JSON.stringify(livekitToken, null, 2) }}</pre>
      </div>

      <LogBox :entries="entries" />
    </div>

    <!-- Card 3: Session 管理 -->
    <div class="card">
      <h3>Session 管理</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>session_id</label>
          <input v-model="sessionId" type="text" placeholder="从 Chat 自动填入，或手动输入" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" @click="getSession">获取详情</button>
        <button class="btn btn-outline" @click="pauseSession">暂停</button>
        <button class="btn btn-outline" @click="resumeSession">恢复</button>
        <button class="btn btn-danger"  @click="endSession">结束</button>
      </div>

      <div v-if="sessionDetail" class="result-box">
        <div><strong>id:</strong> {{ sessionDetail.id }}</div>
        <div><strong>room_id:</strong> {{ sessionDetail.room_id }}</div>
        <div><strong>status:</strong> <span :class="`status-${sessionDetail.status}`">{{ sessionDetail.status }}</span></div>
        <div><strong>created_at:</strong> {{ new Date(sessionDetail.created_at).toLocaleString() }}</div>
      </div>
    </div>

    <!-- Card 5: 语音对话 -->
    <div class="card">
      <h3>语音对话</h3>
      <div class="row">
        <div class="field">
          <label>选择 Agent</label>
          <select v-model="voiceAgentId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field" style="flex:2">
          <label>开场语</label>
          <input v-model="voiceInitMsg" type="text" placeholder="你好" />
        </div>
      </div>

      <div class="voice-status" :class="`vs-${voiceState}`">
        <span class="voice-dot" />
        <span>{{ { idle: "未连接", connecting: "连接中…", connected: "已连接", disconnecting: "断开中…" }[voiceState] }}</span>
        <span v-if="voiceSessionId && voiceState !== 'idle'" class="voice-sid">{{ voiceSessionId.slice(0, 8) }}…</span>
      </div>

      <div v-if="voiceState === 'connected'" class="speakers-row">
        <div class="speaker-pill" :class="{ speaking: localSpeaking }">🎤 我</div>
        <div class="speaker-pill" :class="{ speaking: agentSpeaking }">🤖 Agent</div>
      </div>

      <div v-if="voiceState === 'connected'" class="subtitle-box">
        <div v-if="!subtitleLines.length" class="subtitle-empty">等待字幕…</div>
        <div
          v-for="line in subtitleLines"
          :key="line.id"
          :class="['subtitle-line', `sub-${line.role}`, { 'sub-live': !line.final }]"
        >
          <span class="sub-role">{{ line.role === "user" ? "我" : "Agent" }}</span>
          <span class="sub-text">{{ line.text }}</span>
          <span v-if="!line.final" class="sub-cursor">▋</span>
        </div>
      </div>

      <div class="btn-row">
        <button v-if="voiceState === 'idle'" class="btn btn-primary" @click="startVoice">
          📞 开始语音对话
        </button>
        <template v-else-if="voiceState === 'connected'">
          <button class="btn btn-outline" @click="toggleMic">
            {{ micEnabled ? "🔇 静音" : "🎤 取消静音" }}
          </button>
          <button class="btn btn-danger" @click="stopVoice">📵 挂断</button>
        </template>
        <button v-else class="btn btn-outline" disabled>
          {{ voiceState === "connecting" ? "连接中…" : "断开中…" }}
        </button>
      </div>

      <!-- hidden audio output for agent voice -->
      <audio ref="audioEl" autoplay style="display:none" />
    </div>

    <!-- Card 4: 消息记录 -->
    <div class="card">
      <h3>消息记录</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>session_id</label>
          <input v-model="msgSessionId" type="text" placeholder="从 Chat 自动填入，或手动输入" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="loadMessages">加载消息</button>
        </div>
      </div>

      <div v-if="messages.length" class="message-list">
        <div v-for="msg in messages" :key="msg.id" :class="`message-item role-${msg.role}`">
          <span class="role-badge">{{ msg.role }}</span>
          <span class="msg-content">{{ msg.content }}</span>
          <span class="msg-time">{{ new Date(msg.created_at).toLocaleTimeString() }}</span>
        </div>
      </div>

      <div class="sub-section">
        <h4>追加消息</h4>
        <div class="row">
          <div class="field">
            <label>role</label>
            <select v-model="appendRole">
              <option value="user">user</option>
              <option value="assistant">assistant</option>
              <option value="system">system</option>
            </select>
          </div>
          <div class="field" style="flex:3">
            <label>content</label>
            <textarea v-model="appendContent" rows="2" placeholder="消息内容" />
          </div>
        </div>
        <button class="btn btn-primary" @click="appendMessage">追加消息</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.agent-table th,
.agent-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.agent-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}
.sub-section {
  margin-top: 1.2rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sub-section h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--text-muted, #6b7280);
}
.result-box {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-alt, #f8fafc);
  border-radius: 6px;
  font-size: 0.85rem;
  line-height: 1.8;
}
.result-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 0.8rem;
}
.btn-sm {
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
}
.btn-danger {
  background: #ef4444;
  color: #fff;
  border: none;
}
.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}
.message-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.message-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
}
.role-user      { background: #eff6ff; }
.role-assistant { background: #f0fdf4; }
.role-system    { background: #fefce8; }
.role-badge {
  font-weight: 700;
  font-size: 0.75rem;
  min-width: 4.5rem;
  color: var(--text-muted, #6b7280);
}
.msg-content { flex: 1; }
.msg-time {
  font-size: 0.73rem;
  color: var(--text-muted, #9ca3af);
  white-space: nowrap;
}
.status-active   { color: #16a34a; font-weight: 600; }
.status-paused   { color: #d97706; font-weight: 600; }
.status-ended    { color: #6b7280; }
.status-error    { color: #dc2626; font-weight: 600; }

/* Voice card */
.voice-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;
  font-size: 0.88rem;
  font-weight: 500;
}
.voice-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.vs-idle        .voice-dot { background: #9ca3af; }
.vs-connecting  .voice-dot { background: #f59e0b; animation: pulse 1s infinite; }
.vs-connected   .voice-dot { background: #22c55e; animation: pulse 2s infinite; }
.vs-disconnecting .voice-dot { background: #ef4444; animation: pulse 0.5s infinite; }
.vs-idle        { color: #6b7280; }
.vs-connecting  { color: #d97706; }
.vs-connected   { color: #16a34a; }
.vs-disconnecting { color: #dc2626; }
.voice-sid {
  font-size: 0.75rem;
  font-family: monospace;
  color: #9ca3af;
  margin-left: 0.25rem;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.speakers-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.speaker-pill {
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 2px solid transparent;
  font-size: 0.85rem;
  background: var(--bg-alt, #f1f5f9);
  transition: all 0.15s;
}
.speaker-pill.speaking {
  border-color: #22c55e;
  background: #dcfce7;
  font-weight: 600;
  animation: pulse 0.8s infinite;
}

/* Subtitles */
.subtitle-box {
  min-height: 4rem;
  max-height: 14rem;
  overflow-y: auto;
  margin: 0.75rem 0;
  padding: 0.6rem 0.8rem;
  background: #0f172a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.subtitle-empty {
  color: #475569;
  font-size: 0.82rem;
  text-align: center;
  padding: 0.5rem 0;
}
.subtitle-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #e2e8f0;
}
.sub-role {
  font-size: 0.72rem;
  font-weight: 700;
  min-width: 2.8rem;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sub-user .sub-role  { color: #60a5fa; }
.sub-agent .sub-role { color: #34d399; }
.sub-text { flex: 1; }
.sub-live .sub-text  { color: #94a3b8; }
.sub-cursor {
  animation: blink 0.9s step-start infinite;
  color: #94a3b8;
  font-size: 0.8rem;
}
@keyframes blink {
  50% { opacity: 0; }
}
</style>

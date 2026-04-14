<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { AgentResponse, SessionResponse, MessageResponse, SkillResponse, KnowledgeResponse, ToolResponse } from "@audarai/sdk";
import { Room, RoomEvent, Track, createLocalAudioTrack, type TranscriptionSegment, type Participant } from "livekit-client";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Agents ─────────────────────────────────────────────────────────────
const agents = ref<AgentResponse[]>([]);

// ── 下拉选项数据 ────────────────────────────────────────────────────────────────
const skillList      = ref<SkillResponse[]>([]);
const knowledgeList  = ref<KnowledgeResponse[]>([]);
const toolList       = ref<ToolResponse[]>([]);
const voiceList      = ref<string[]>([]);

async function loadDropdownData() {
  if (!client.value) return;
  try {
    const [skills, knowledge, tools, voices] = await Promise.all([
      client.value.agent.skills.list(),
      client.value.agent.knowledge.list(),
      client.value.agent.tools.list(),
      client.value.tts.listSpeakers(),
    ]);
    skillList.value     = skills;
    knowledgeList.value = knowledge;
    toolList.value      = tools;
    voiceList.value     = voices;
  } catch (err) {
    logError(err);
  }
}

const newAgent = ref({
  name: "",
  description: "",
  system_prompt: "",
  voice_id: "",
  role: "",
  language: "",
  archetype_id: "",
  is_public: false,
  skills: [] as string[],
  knowledge_bindings: [] as string[],
  tool_bindings: [] as string[],
  memory_enable: false,
  memory_turns: "" as number | "",
});

async function listAgents() {
  log("获取 Agent 列表...", "info");
  try {
    [agents.value] = await Promise.all([
      client.value!.agent.listAgents(),
      loadDropdownData(),
    ]);
    log(`共 ${agents.value.length} 个 Agent`, "ok");
  } catch (err) {
    logError(err);
  }
}

const platformAgents = ref<AgentResponse[]>([]);

async function listPlatformAgents() {
  log("获取平台 Agent 列表...", "info");
  try {
    platformAgents.value = await client.value!.agent.listPlatformAgents();
    log(`平台共 ${platformAgents.value.length} 个 Agent`, "ok");
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
      voice_id: newAgent.value.voice_id || undefined,
      role: newAgent.value.role || undefined,
      language: newAgent.value.language || undefined,
      archetype_id: newAgent.value.archetype_id || undefined,
      is_public: newAgent.value.is_public,
      skills: newAgent.value.skills.length ? newAgent.value.skills : undefined,
      knowledge_bindings: newAgent.value.knowledge_bindings.length ? newAgent.value.knowledge_bindings : undefined,
      tool_bindings: newAgent.value.tool_bindings.length ? newAgent.value.tool_bindings.map(id => ({ tool_id: id })) : undefined,
      memory_policy: (newAgent.value.memory_enable || newAgent.value.memory_turns !== "")
        ? {
            enable_memory: newAgent.value.memory_enable,
            ...(newAgent.value.memory_turns !== "" ? { num_history_turns: newAgent.value.memory_turns as number } : {}),
          }
        : undefined,
    });
    agents.value.push(created);
    log(`Agent 创建成功: ${created.id}`, "ok");
    newAgent.value = { name: "", description: "", system_prompt: "", voice_id: "", role: "", language: "", archetype_id: "", is_public: false, skills: [], knowledge_bindings: [], tool_bindings: [], memory_enable: false, memory_turns: "" };
  } catch (err) {
    logError(err);
  }
}

// ── 编辑 Agent ─────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editForm = ref({
  name: "",
  description: "",
  system_prompt: "",
  voice_id: "",
  role: "",
  language: "",
  archetype_id: "",
  is_public: false,
  skills: [] as string[],
  knowledge_bindings: [] as string[],
  tool_bindings: [] as string[],
  memory_enable: false,
  memory_turns: "" as number | "",
});

function startEdit(a: AgentResponse) {
  editingId.value = a.id;
  editForm.value = {
    name: a.name,
    description: a.description,
    system_prompt: a.system_prompt,
    voice_id: a.voice_id ?? "",
    role: a.role ?? "",
    language: a.language ?? "",
    archetype_id: a.archetype_id ?? "",
    is_public: a.is_public,
    skills: [...a.skills],
    knowledge_bindings: [...a.knowledge_bindings],
    tool_bindings: a.tool_bindings.map(b => b.tool_id),
    memory_enable: a.memory_policy?.enable_memory ?? false,
    memory_turns: a.memory_policy?.num_history_turns ?? "",
  };
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  log(`更新 Agent: ${editingId.value}...`, "info");
  try {
    const updated = await client.value!.agent.updateAgent(editingId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
      system_prompt: editForm.value.system_prompt || undefined,
      voice_id: editForm.value.voice_id || undefined,
      role: editForm.value.role || undefined,
      language: editForm.value.language || undefined,
      archetype_id: editForm.value.archetype_id || undefined,
      is_public: editForm.value.is_public,
      skills: editForm.value.skills.length ? editForm.value.skills : undefined,
      knowledge_bindings: editForm.value.knowledge_bindings.length ? editForm.value.knowledge_bindings : undefined,
      tool_bindings: editForm.value.tool_bindings.length ? editForm.value.tool_bindings.map(id => ({ tool_id: id })) : undefined,
      memory_policy: (editForm.value.memory_enable || editForm.value.memory_turns !== "")
        ? {
            enable_memory: editForm.value.memory_enable,
            ...(editForm.value.memory_turns !== "" ? { num_history_turns: editForm.value.memory_turns as number } : {}),
          }
        : undefined,
    });
    const idx = agents.value.findIndex(a => a.id === updated.id);
    if (idx >= 0) agents.value[idx] = updated;
    log(`Agent 更新成功: ${updated.id}`, "ok");
    editingId.value = null;
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
const chatVoiceId = ref("");
const chatSessionId = ref("");
const chatRoomId = ref("");
const livekitToken = ref<Record<string, unknown> | null>(null);

async function startChat() {
  if (!chatAgentId.value) { log("请选择 Agent", "warn"); return; }
  if (!chatMessage.value.trim()) { log("请输入消息", "warn"); return; }
  log(`发起 Chat (agent=${chatAgentId.value})...`, "info");
  try {
    const res = await client.value!.agent.createVoiceSession(chatAgentId.value, {
      message: chatMessage.value,
      ...(chatVoiceId.value ? { voice_id: chatVoiceId.value } : {}),
      ...(userName.value ? { user_name: userName.value } : {}),
      ...(userId.value ? { user_id: userId.value } : {}),
    });
    chatSessionId.value = res.session_id;
    chatRoomId.value = res.room_id;
    sessionId.value = res.session_id;
    msgSessionId.value = res.session_id;
    livekitToken.value = res as unknown as Record<string, unknown>;
    log(`Chat 成功 — session_id: ${res.session_id}`, "ok");
    await loadMessages();
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
    sessionDetail.value = await client.value!.agent.sessions.get(sessionId.value);
    log(`状态: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function pauseSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("暂停 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.sessions.pause(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function resumeSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("恢复 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.sessions.resume(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function endSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("结束 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.sessions.end(sessionId.value);
    log(`状态已更新: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 4: 消息记录 ────────────────────────────────────────────────────────────
const msgSessionId = ref("");
const messages = ref<MessageResponse[]>([]);
const appendRole = ref("user");
const appendContent = ref("");
const appendSpeakerType = ref("");
const appendSpeakerRefId = ref("");

async function loadMessages() {
  if (!msgSessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("加载消息...", "info");
  try {
    const res = await client.value!.agent.sessions.listMessages(msgSessionId.value);
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

const voiceAgentId       = ref("");
const voiceInitMsg       = ref("你好");
const voiceVoiceId       = ref("");
const userName           = ref("");
const userId             = ref("");

function randomizeUser() {
  const rand = () => Math.random().toString(36).slice(2, 6);
  userName.value = `用户_${rand()}`;
  userId.value   = `user_${rand()}${rand()}`;
}
const voiceState         = ref<VoiceState>("idle");
const voiceSessionId     = ref("");
const joinSessionId      = ref("");
const micEnabled         = ref(true);
const speakingIdentities = ref<string[]>([]);
const localIdentity      = ref("");
const audioEl            = ref<HTMLAudioElement | null>(null);

interface LkParticipant { identity: string; name?: string; sid: string }
const lkParticipants = ref<LkParticipant[]>([]);

interface SubtitleLine { id: string; text: string; role: "user" | "agent"; final: boolean }
const subtitleLines = ref<SubtitleLine[]>([]);
const MAX_FINAL_SUBTITLES = 10;

let _room: Room | null = null;

function teardownRoom() {
  if (_room) {
    _room.removeAllListeners();
    _room = null;
  }
  speakingIdentities.value = [];
  localIdentity.value = "";
  lkParticipants.value = [];
  voiceState.value = "idle";
}

/** Create Room + attach all event listeners (sync, no I/O). */
function _prepareRoom(): Room {
  const room = new Room({
    adaptiveStream: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  _room = room;

  room.on(RoomEvent.Connected, () => {
    voiceState.value = "connected";
    localIdentity.value = room.localParticipant.identity;
    lkParticipants.value = Array.from(room.remoteParticipants.values())
      .map(p => ({ identity: p.identity, name: p.name, sid: p.sid }));
    log(`已连接到语音房间 — 本地参与者: identity="${room.localParticipant.identity}", name="${room.localParticipant.name}"`, "ok");
  });
  room.on(RoomEvent.ParticipantConnected, (p) => {
    lkParticipants.value.push({ identity: p.identity, name: p.name, sid: p.sid });
    log(`成员加入: identity="${p.identity}", name="${p.name}"`, "info");
  });
  room.on(RoomEvent.ParticipantNameChanged, (name, participant) => {
    const idx = lkParticipants.value.findIndex(p => p.sid === participant.sid);
    if (idx >= 0) lkParticipants.value[idx] = { ...lkParticipants.value[idx], name };
  });
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    lkParticipants.value = lkParticipants.value.filter(x => x.sid !== p.sid);
    log(`成员离开: identity="${p.identity}"`, "info");
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
    speakingIdentities.value = speakers.map(s => s.identity);
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
    const finals = subtitleLines.value.filter(l => l.final).slice(-MAX_FINAL_SUBTITLES);
    const lives  = subtitleLines.value.filter(l => !l.final);
    subtitleLines.value = [...finals, ...lives];
  });

  subtitleLines.value = [];
  return room;
}

/** Pre-warm mic permission (fire-and-forget). Browser caches the grant for subsequent getUserMedia calls. */
function _warmMicrophone(): Promise<void> {
  return navigator.mediaDevices.getUserMedia({ audio: true })
    .then(s => { s.getTracks().forEach(t => t.stop()); })
    .catch(() => {});
}

async function startVoice() {
  if (!voiceAgentId.value) { log("请选择 Agent", "warn"); return; }
  voiceState.value = "connecting";
  log("发起语音对话...", "info");
  try {
    // 1. Prepare Room + events immediately (sync)
    const room = _prepareRoom();

    // 2. Parallel: API call + LiveKit pre-warm + mic permission
    const livekitUrl = (client.value as any)?.livekitUrl as string | undefined;
    if (livekitUrl) {
      room.prepareConnection(livekitUrl);
    }

    const [res] = await Promise.all([
      client.value!.agent.createVoiceSession(voiceAgentId.value, {
        message: voiceInitMsg.value || "你好",
        ...(voiceVoiceId.value ? { voice_id: voiceVoiceId.value } : {}),
        ...(userName.value ? { user_name: userName.value } : {}),
        ...(userId.value ? { user_id: userId.value } : {}),
      }),
      _warmMicrophone(),
    ]);

    voiceSessionId.value = res.session_id;
    log(`Session: ${res.session_id} (显示名: "${userName.value || '未设置'}", user_id: "${userId.value || '未设置'}")`, "info");

    // 3. Connect — DNS/TLS already warm, mic permission cached
    await room.connect(res.livekit_url, res.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    micEnabled.value = true;

    // Cache livekit_url for future preconnects
  } catch (err) {
    teardownRoom();
    logError(err);
  }
}

async function joinVoice() {
  if (!joinSessionId.value.trim()) { log("请输入要加入的 session_id", "warn"); return; }
  voiceState.value = "connecting";
  log("加入已有 Session...", "info");
  try {
    // 1. Prepare Room + events immediately
    const room = _prepareRoom();

    const livekitUrl = (client.value as any)?.livekitUrl as string | undefined;
    if (livekitUrl) {
      room.prepareConnection(livekitUrl);
    }

    // 2. Parallel: API call + mic permission
    const tokenData = (userName.value || userId.value) ? { ...(userName.value ? { user_name: userName.value } : {}), ...(userId.value ? { user_id: userId.value } : {}) } : undefined;
    const [tokenRes] = await Promise.all([
      client.value!.agent.sessions.join(joinSessionId.value, tokenData),
      _warmMicrophone(),
    ]);

    voiceSessionId.value = joinSessionId.value;
    log(`Token 获取成功，连接中... (显示名: "${userName.value || '未设置'}", user_id: "${userId.value || '未设置'}")`, "info");

    // 3. Connect
    await room.connect(tokenRes.livekit_url, tokenRes.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    micEnabled.value = true;

    (client.value as any)?.preconnect?.(tokenRes.livekit_url);
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
    const msg = await client.value!.agent.sessions.appendMessage(msgSessionId.value, {
      role: appendRole.value || undefined,
      content: appendContent.value,
      speaker_type: appendSpeakerType.value || undefined,
      speaker_ref_id: appendSpeakerRefId.value || undefined,
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
        <button class="btn btn-outline" @click="listPlatformAgents">获取平台 Agent</button>
        <button class="btn btn-outline" @click="loadDropdownData">刷新下拉选项</button>
      </div>

      <table v-if="platformAgents.length" class="agent-table">
        <caption style="text-align:left;font-size:0.8rem;color:var(--text-muted,#6b7280);margin-bottom:0.3rem">平台 Agent（只读，任何租户可使用）</caption>
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>语言</th>
            <th>voice_id</th>
            <th>role</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in platformAgents" :key="a.id">
            <td class="id-cell" :title="a.id">{{ a.id.slice(0, 8) }}…</td>
            <td>{{ a.name }}</td>
            <td>{{ a.language ?? "—" }}</td>
            <td>{{ a.voice_id ?? "—" }}</td>
            <td>{{ a.role ?? "—" }}</td>
          </tr>
        </tbody>
      </table>

      <table v-if="agents.length" class="agent-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>语言</th>
            <th>voice_id</th>
            <th>role</th>
            <th>skills</th>
            <th>knowledge</th>
            <th>tools</th>
            <th>memory</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in agents" :key="agent.id">
            <td class="id-cell" :title="agent.id">{{ agent.id.slice(0, 8) }}…</td>
            <td>{{ agent.name }}</td>
            <td>{{ agent.language ?? "—" }}</td>
            <td>{{ agent.voice_id ?? "—" }}</td>
            <td>{{ agent.role ?? "—" }}</td>
            <td>{{ agent.skills.length }}</td>
            <td>{{ agent.knowledge_bindings.length }}</td>
            <td>{{ agent.tool_bindings.length }}</td>
            <td>{{ agent.memory_policy?.enable_memory ? "✓" : "✗" }}</td>
            <td>{{ new Date(agent.created_at).toLocaleString() }}</td>
            <td>
              <button class="btn btn-sm btn-outline" @click="startEdit(agent)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteAgent(agent.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 编辑表单 -->
      <div v-if="editingId" class="sub-section">
        <h4>编辑 Agent <span class="editing-id">{{ editingId.slice(0, 8) }}…</span></h4>
        <div class="row">
          <div class="field">
            <label>名称</label>
            <input v-model="editForm.name" type="text" />
          </div>
          <div class="field">
            <label>language</label>
            <input v-model="editForm.language" type="text" placeholder="zh-CN" />
          </div>
          <div class="field">
            <label>voice_id</label>
            <select v-model="editForm.voice_id">
              <option value="">— 不设置 —</option>
              <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>role</label>
            <small class="field-tip">间接影响行为，不注入 LLM prompt。写入 agents_metadata 传给 LiveKit worker，多代理场景中用于识别代理身份及 Orchestrator 路由调度</small>
            <input v-model="editForm.role" type="text" />
          </div>
          <div class="field">
            <label>archetype_id</label>
            <input v-model="editForm.archetype_id" type="text" />
          </div>
          <div class="field" style="align-self:flex-end">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">
              <input v-model="editForm.is_public" type="checkbox" />
              is_public
            </label>
          </div>
        </div>
        <div class="field">
          <label>description</label>
          <small class="field-tip">纯元数据，不影响提示词，不传给 LiveKit worker，不进入 LLM。仅用于 API 返回和管理界面展示</small>
          <input v-model="editForm.description" type="text" />
        </div>
        <div class="field">
          <label>system_prompt</label>
          <small class="field-tip">直接注入 LLM 的最高优先级系统指令。优先级：agent.system_prompt → identity["instructions"] → archetype.base_prompt → DEFAULT_INSTRUCTIONS，最终拼接为 system_prompt + "\n" + TTS_RULES</small>
          <textarea v-model="editForm.system_prompt" rows="2" />
        </div>
        <div class="field">
          <label>skills</label>
          <select v-model="editForm.skills" multiple class="multi-select">
            <option v-for="s in skillList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>knowledge_bindings</label>
          <select v-model="editForm.knowledge_bindings" multiple class="multi-select">
            <option v-for="k in knowledgeList" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>tool_bindings</label>
          <select v-model="editForm.tool_bindings" multiple class="multi-select">
            <option v-for="t in toolList" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="row" style="align-items:center">
          <div class="field" style="align-self:flex-end">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">
              <input v-model="editForm.memory_enable" type="checkbox" />
              enable_memory
            </label>
          </div>
          <div class="field">
            <label>num_history_turns</label>
            <input v-model.number="editForm.memory_turns" type="number" min="1" placeholder="可选" />
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveEdit">保存</button>
          <button class="btn btn-outline" @click="cancelEdit">取消</button>
        </div>
      </div>

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
            <label>voice_id</label>
            <select v-model="newAgent.voice_id">
              <option value="">— 不设置 —</option>
              <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>role</label>
            <small class="field-tip">间接影响行为，不注入 LLM prompt。写入 agents_metadata 传给 LiveKit worker，多代理场景中用于识别代理身份及 Orchestrator 路由调度</small>
            <input v-model="newAgent.role" type="text" placeholder="角色描述（可选）" />
          </div>
          <div class="field">
            <label>archetype_id</label>
            <input v-model="newAgent.archetype_id" type="text" placeholder="原型 UUID（可选）" />
          </div>
          <div class="field" style="align-self:flex-end">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">
              <input v-model="newAgent.is_public" type="checkbox" />
              is_public
            </label>
          </div>
        </div>
        <div class="field">
          <label>description</label>
          <small class="field-tip">纯元数据，不影响提示词，不传给 LiveKit worker，不进入 LLM。仅用于 API 返回和管理界面展示</small>
          <input v-model="newAgent.description" type="text" placeholder="可选描述" />
        </div>
        <div class="field">
          <label>system_prompt</label>
          <small class="field-tip">直接注入 LLM 的最高优先级系统指令。优先级：agent.system_prompt → identity["instructions"] → archetype.base_prompt → DEFAULT_INSTRUCTIONS，最终拼接为 system_prompt + "\n" + TTS_RULES</small>
          <textarea v-model="newAgent.system_prompt" rows="2" placeholder="系统提示词（可选）" />
        </div>
        <div class="field">
          <label>skills</label>
          <select v-model="newAgent.skills" multiple class="multi-select">
            <option v-for="s in skillList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>knowledge_bindings</label>
          <select v-model="newAgent.knowledge_bindings" multiple class="multi-select">
            <option v-for="k in knowledgeList" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>tool_bindings</label>
          <select v-model="newAgent.tool_bindings" multiple class="multi-select">
            <option v-for="t in toolList" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="row" style="align-items:center">
          <div class="field" style="align-self:flex-end">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">
              <input v-model="newAgent.memory_enable" type="checkbox" />
              enable_memory
            </label>
          </div>
          <div class="field">
            <label>num_history_turns</label>
            <input v-model.number="newAgent.memory_turns" type="number" min="1" placeholder="可选" />
          </div>
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
        <div class="field">
          <label>voice_id（可选覆盖）</label>
          <select v-model="chatVoiceId">
            <option value="">— 使用 Agent 默认 —</option>
            <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" @click="startChat">发起 Chat</button>
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
        <div class="field">
          <label>开场语</label>
          <input v-model="voiceInitMsg" type="text" placeholder="你好" />
        </div>
        <div class="field">
          <label>voice_id（可选覆盖）</label>
          <select v-model="voiceVoiceId">
            <option value="">— 使用 Agent 默认 —</option>
            <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
        <div class="field">
          <label>我的显示名</label>
          <input v-model="userName" type="text" placeholder="可选" />
        </div>
        <div class="field">
          <label>我的用户 ID</label>
          <input v-model="userId" type="text" placeholder="可选，作为 LiveKit identity" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="randomizeUser">随机</button>
        </div>
      </div>

      <div class="voice-status" :class="`vs-${voiceState}`">
        <span class="voice-dot" />
        <span>{{ { idle: "未连接", connecting: "连接中…", connected: "已连接", disconnecting: "断开中…" }[voiceState] }}</span>
        <span v-if="voiceSessionId && voiceState !== 'idle'" class="voice-sid">{{ voiceSessionId.slice(0, 8) }}…</span>
      </div>

      <div v-if="voiceState === 'connected'" class="speakers-row">
        <div class="speaker-pill" :class="{ speaking: speakingIdentities.includes(localIdentity) }">
          {{ micEnabled ? '🎤' : '🔇' }} {{ userName || localIdentity || '我' }}
        </div>
        <div
          v-for="p in lkParticipants"
          :key="p.sid"
          class="speaker-pill"
          :class="{ speaking: speakingIdentities.includes(p.identity) }"
        >
          🎤 {{ p.name || p.identity }}
        </div>
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

      <div class="sub-section">
        <h4>加入已有 Session</h4>
        <div class="row">
          <div class="field" style="flex:3">
            <label>session_id</label>
            <input v-model="joinSessionId" type="text" placeholder="已有活跃 Session 的 ID" :disabled="voiceState !== 'idle'" />
          </div>
        </div>
        <p class="hint">Session 已在 preparing / running 状态时使用此入口，不会重新创建房间。</p>
      </div>

      <div class="btn-row">
        <template v-if="voiceState === 'idle'">
          <button class="btn btn-primary" @click="startVoice">📞 开始语音对话</button>
          <button class="btn btn-outline" :disabled="!joinSessionId" @click="joinVoice">🔗 加入已有 Session</button>
        </template>
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
          <span class="role-badge">{{ msg.role }}<template v-if="msg.speaker_type"> · {{ msg.speaker_type }}</template></span>
          <span class="msg-content">{{ msg.content }}</span>
          <span class="msg-time">#{{ msg.seq_num }} {{ new Date(msg.created_at).toLocaleTimeString() }}</span>
        </div>
      </div>

      <div class="sub-section">
        <h4>追加消息</h4>
        <div class="row">
          <div class="field">
            <label>role（可选）</label>
            <select v-model="appendRole">
              <option value="">—</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
              <option value="system">system</option>
            </select>
          </div>
          <div class="field">
            <label>speaker_type（可选）</label>
            <input v-model="appendSpeakerType" type="text" placeholder="human / agent / system" />
          </div>
          <div class="field">
            <label>speaker_ref_id（可选）</label>
            <input v-model="appendSpeakerRefId" type="text" placeholder="Agent UUID 等" />
          </div>
        </div>
        <div class="field">
          <label>content</label>
          <textarea v-model="appendContent" rows="2" placeholder="消息内容" />
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
.multi-select {
  min-height: 80px;
  width: 100%;
}
.field-tip {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
  margin-bottom: 0.25rem;
  line-height: 1.4;
}
.editing-id {
  font-family: monospace;
  font-size: 0.78rem;
  color: #9ca3af;
  margin-left: 0.4rem;
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

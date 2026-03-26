<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { RoomResponse, RoomAgentListResponse, AgentResponse, SessionResponse, MessageResponse, Participant, SkillResponse, ToolResponse } from "@aivox/sdk";
import { Room, RoomEvent, Track, type TranscriptionSegment, type Participant as LkParticipantBase } from "livekit-client";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Agent List (shared for selectors) ────────────────────────────────────────
const agentsList = ref<AgentResponse[]>([]);
const voiceList  = ref<string[]>([]);

async function loadAgents() {
  log("获取 Agent 列表...", "info");
  try {
    agentsList.value = await client.value!.agent.listAgents();
    log(`共 ${agentsList.value.length} 个 Agent`, "ok");
  } catch (err) {
    logError(err);
  }
}

const skillsList = ref<SkillResponse[]>([]);
const toolsList  = ref<ToolResponse[]>([]);

async function loadSkills() {
  try {
    skillsList.value = await client.value!.agent.skills.list();
  } catch { /* ignore */ }
}

async function loadTools() {
  try {
    toolsList.value = await client.value!.agent.tools.list();
  } catch { /* ignore */ }
}

async function loadVoiceList() {
  try {
    const res = await client.value!.tts.listSpeakers();
    voiceList.value = res.speakers.map(s => s.name);
  } catch {
    // ignore — voice list is optional
  }
}

// ── Room List ─────────────────────────────────────────────────────────────────
const rooms = ref<RoomResponse[]>([]);

async function listRooms() {
  log("获取 Room 列表...", "info");
  try {
    rooms.value = await client.value!.agent.rooms.list();
    log(`共 ${rooms.value.length} 个 Room`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Create Room ───────────────────────────────────────────────────────────────
const newRoom = ref({
  name: "", description: "", room_type: "", room_prompt: "",
  agent_ids: [] as string[],
  visibility: "private" as "private" | "shared" | "public",
  talking_style: "sequential" as "sequential" | "moderator_led" | "freeform",
  speaking_rules: "",
  skill_ids: [] as string[],
  tool_ids: [] as string[],
});

async function createRoom() {
  if (!newRoom.value.name.trim()) { log("请填写 Room 名称", "warn"); return; }
  log(`创建 Room: ${newRoom.value.name}...`, "info");
  try {
    const created = await client.value!.agent.rooms.create({
      name: newRoom.value.name,
      description: newRoom.value.description || undefined,
      room_type: newRoom.value.room_type || undefined,
      room_prompt: newRoom.value.room_prompt || undefined,
      agent_ids: newRoom.value.agent_ids.length ? newRoom.value.agent_ids : undefined,
      visibility: newRoom.value.visibility,
      talking_style: newRoom.value.talking_style,
      speaking_rules: newRoom.value.speaking_rules || undefined,
      skill_ids: newRoom.value.skill_ids.length ? newRoom.value.skill_ids : undefined,
      tool_ids: newRoom.value.tool_ids.length ? newRoom.value.tool_ids : undefined,
    });
    rooms.value.push(created);
    log(`Room 创建成功: ${created.id}`, "ok");
    newRoom.value = { name: "", description: "", room_type: "", room_prompt: "", agent_ids: [], visibility: "private", talking_style: "sequential", speaking_rules: "", skill_ids: [], tool_ids: [] };
  } catch (err) {
    logError(err);
  }
}

// ── Edit Room ─────────────────────────────────────────────────────────────────
const editingRoomId = ref<string | null>(null);
const editRoomForm = ref({
  name: "", description: "", room_prompt: "", agent_ids: [] as string[],
  visibility: "private" as "private" | "shared" | "public",
  talking_style: "sequential" as "sequential" | "moderator_led" | "freeform",
  speaking_rules: "",
  skill_ids: [] as string[],
  tool_ids: [] as string[],
});

function startEditRoom(r: RoomResponse) {
  editingRoomId.value = r.id;
  editRoomForm.value = {
    name: r.name,
    description: r.description,
    room_prompt: r.room_prompt,
    agent_ids: [...r.agent_ids],
    visibility: (r.visibility || "private") as "private" | "shared" | "public",
    talking_style: (r.talking_style || "sequential") as "sequential" | "moderator_led" | "freeform",
    speaking_rules: r.speaking_rules || "",
    skill_ids: [...(r.skill_ids || [])],
    tool_ids: [...(r.tool_ids || [])],
  };
}

function cancelEditRoom() { editingRoomId.value = null; }

async function saveEditRoom() {
  if (!editingRoomId.value) return;
  log(`更新 Room: ${editingRoomId.value}...`, "info");
  try {
    const updated = await client.value!.agent.rooms.update(editingRoomId.value, {
      name: editRoomForm.value.name || undefined,
      description: editRoomForm.value.description || undefined,
      room_prompt: editRoomForm.value.room_prompt || undefined,
      agent_ids: editRoomForm.value.agent_ids.length ? editRoomForm.value.agent_ids : undefined,
      visibility: editRoomForm.value.visibility,
      talking_style: editRoomForm.value.talking_style,
      speaking_rules: editRoomForm.value.speaking_rules || undefined,
      skill_ids: editRoomForm.value.skill_ids,
      tool_ids: editRoomForm.value.tool_ids,
    });
    const idx = rooms.value.findIndex(r => r.id === updated.id);
    if (idx >= 0) rooms.value[idx] = updated;
    log(`Room 更新成功: ${updated.id}`, "ok");
    editingRoomId.value = null;
  } catch (err) {
    logError(err);
  }
}

async function deleteRoom(id: string) {
  log(`删除 Room: ${id}...`, "info");
  try {
    await client.value!.agent.rooms.delete(id);
    rooms.value = rooms.value.filter(r => r.id !== id);
    log("删除成功", "ok");
    if (startSessionRoomId.value === id) startSessionRoomId.value = "";
    if (agentMgmtRoomId.value === id) agentMgmtRoomId.value = "";
  } catch (err) {
    logError(err);
  }
}

// ── Get Room Detail ───────────────────────────────────────────────────────────
const getRoomId = ref("");
const roomDetail = ref<RoomResponse | null>(null);

async function getRoom() {
  if (!getRoomId.value.trim()) { log("请输入 room_id", "warn"); return; }
  log(`获取 Room 详情: ${getRoomId.value}...`, "info");
  try {
    roomDetail.value = await client.value!.agent.rooms.get(getRoomId.value);
    log(`Room: ${roomDetail.value.name} (${roomDetail.value.status})`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Room Agents ───────────────────────────────────────────────────────────────
const agentMgmtRoomId = ref("");
const roomAgents = ref<RoomAgentListResponse | null>(null);
const addAgentId = ref("");

async function listRoomAgents() {
  if (!agentMgmtRoomId.value.trim()) { log("请选择 Room", "warn"); return; }
  log("获取 Room Agent 列表...", "info");
  try {
    roomAgents.value = await client.value!.agent.rooms.listAgents(agentMgmtRoomId.value);
    log(`共 ${roomAgents.value.agent_ids.length} 个 Agent`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function addRoomAgent() {
  if (!agentMgmtRoomId.value.trim()) { log("请选择 Room", "warn"); return; }
  if (!addAgentId.value.trim()) { log("请输入 Agent ID", "warn"); return; }
  log(`添加 Agent ${addAgentId.value} 到 Room...`, "info");
  try {
    roomAgents.value = await client.value!.agent.rooms.addAgent(agentMgmtRoomId.value, addAgentId.value);
    addAgentId.value = "";
    log("添加成功", "ok");
  } catch (err) {
    logError(err);
  }
}

async function removeRoomAgent(agentId: string) {
  if (!agentMgmtRoomId.value.trim()) return;
  log(`移除 Agent ${agentId}...`, "info");
  try {
    roomAgents.value = await client.value!.agent.rooms.removeAgent(agentMgmtRoomId.value, agentId);
    log("移除成功", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Start Session ─────────────────────────────────────────────────────────────
const startSessionRoomId = ref("");
const startSessionVoiceId = ref("");
const startedSession = ref<SessionResponse | null>(null);

async function startSession() {
  if (!startSessionRoomId.value.trim()) { log("请选择 Room", "warn"); return; }
  log(`在 Room ${startSessionRoomId.value} 中创建 Session...`, "info");
  try {
    startedSession.value = await client.value!.agent.rooms.startSession(
      startSessionRoomId.value,
      startSessionVoiceId.value ? { voice_id: startSessionVoiceId.value } : undefined,
    );
    sessionId.value = startedSession.value.id;
    log(`Session 创建成功: ${startedSession.value.id}`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── List Sessions ─────────────────────────────────────────────────────────────
const listSessionsRoomId = ref("");
const roomSessions = ref<SessionResponse[]>([]);

async function listRoomSessions() {
  if (!listSessionsRoomId.value.trim()) { log("请选择 Room", "warn"); return; }
  log(`查询 Room ${listSessionsRoomId.value} 的 Session 列表...`, "info");
  try {
    roomSessions.value = await client.value!.agent.rooms.listSessions(listSessionsRoomId.value);
    log(`共 ${roomSessions.value.length} 个 Session`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Session Lifecycle ─────────────────────────────────────────────────────────
const sessionId = ref("");
const sessionDetail = ref<SessionResponse | null>(null);

async function getSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log(`获取 Session: ${sessionId.value}...`, "info");
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
    log(`状态: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function resumeSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("恢复 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.sessions.resume(sessionId.value);
    log(`状态: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function endSession() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("结束 Session...", "info");
  try {
    sessionDetail.value = await client.value!.agent.sessions.end(sessionId.value);
    log(`状态: ${sessionDetail.value.status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Session 成员 ──────────────────────────────────────────────────────────────
const participants = ref<Participant[]>([]);

async function getParticipants() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("查询会话成员...", "info");
  try {
    participants.value = await client.value!.agent.sessions.getParticipants(sessionId.value);
    log(`共 ${participants.value.length} 个成员`, "ok");
  } catch (err) {
    logError(err);
  }
}

function participantDisplayName(p: Participant): string {
  if (p.name) return p.name as string;
  if (p.type === "agent") {
    const agent = agentsList.value.find(a => a.id === p.ref_id);
    if (agent) return agent.name;
  }
  return p.ref_id;
}

// ── Session 消息 ──────────────────────────────────────────────────────────────
const messages = ref<MessageResponse[]>([]);
const appendRole = ref("user");
const appendContent = ref("");
const appendSpeakerType = ref("");
const appendSpeakerRefId = ref("");

async function loadMessages() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  log("加载消息...", "info");
  try {
    const res = await client.value!.agent.sessions.listMessages(sessionId.value);
    messages.value = res.data ?? [];
    log(`共 ${res.total ?? messages.value.length} 条消息`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function appendMessage() {
  if (!sessionId.value.trim()) { log("请输入 session_id", "warn"); return; }
  if (!appendContent.value.trim()) { log("请输入消息内容", "warn"); return; }
  try {
    const msg = await client.value!.agent.sessions.appendMessage(sessionId.value, {
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

// ── 语音对话 (LiveKit) ─────────────────────────────────────────────────────────
type VoiceState = "idle" | "connecting" | "connected" | "disconnecting";

const voiceState         = ref<VoiceState>("idle");
const userName           = ref("");
const userId             = ref("");
const micEnabled         = ref(true);
const speakingIdentities = ref<string[]>([]);
const localIdentity      = ref("");

// v2: per-participant audio elements to support multiple agents speaking simultaneously
const _audioElements = new Map<string, HTMLAudioElement>();

// v2: kind === 2 means ParticipantKind.AGENT (LiveKit constant)
interface LkParticipant { identity: string; name?: string; sid: string; kind?: number }
const lkParticipants = ref<LkParticipant[]>([]);

interface SubtitleLine { id: string; text: string; role: "user" | "agent"; speakerName: string; final: boolean }
const subtitleLines = ref<SubtitleLine[]>([]);
const MAX_FINAL_SUBTITLES = 10;

let _lkRoom: Room | null = null;

function teardownVoice() {
  if (_lkRoom) { _lkRoom.removeAllListeners(); _lkRoom = null; }
  // v2: detach and remove all per-participant audio elements
  for (const el of _audioElements.values()) {
    el.pause();
    el.srcObject = null;
    el.remove();
  }
  _audioElements.clear();
  speakingIdentities.value = [];
  localIdentity.value = "";
  lkParticipants.value = [];
  voiceState.value = "idle";
}

async function copySessionId() {
  if (!sessionId.value) return;
  await navigator.clipboard.writeText(sessionId.value);
  log("Session ID 已复制到剪贴板，可分享给其他用户加入", "ok");
}

async function _connectWithToken(tokenRes: { token: string; livekit_url: string }) {
  const room = new Room({
    adaptiveStream: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  _lkRoom = room;

  room.on(RoomEvent.Connected, () => {
    voiceState.value = "connected";
    localIdentity.value = room.localParticipant.identity;
    // v2: include kind so we can distinguish agents (kind=2) from users (kind=1)
    lkParticipants.value = Array.from(room.remoteParticipants.values())
      .map(p => ({ identity: p.identity, name: p.name, sid: p.sid, kind: p.kind }));
    log(`本地参与者: identity="${room.localParticipant.identity}", name="${room.localParticipant.name}"`, "info");
    for (const p of room.remoteParticipants.values()) {
      const roleLabel = p.kind === 2 ? "🤖 Agent" : "👤 User";
      log(`${roleLabel} 已在房间中: ${JSON.stringify({ identity: p.identity, name: p.name, sid: p.sid })}`, "info");
    }
    log(`已连接到语音房间，当前远端成员共 ${lkParticipants.value.length} 人`, "ok");
  });
  room.on(RoomEvent.ParticipantConnected, (p) => {
    lkParticipants.value.push({ identity: p.identity, name: p.name, sid: p.sid, kind: p.kind });
    const roleLabel = p.kind === 2 ? "🤖 Agent" : "👤 User";
    log(`${roleLabel} 加入: ${JSON.stringify({ identity: p.identity, name: p.name, sid: p.sid })}`, "info");
  });
  room.on(RoomEvent.ParticipantNameChanged, (name, participant) => {
    const idx = lkParticipants.value.findIndex(p => p.sid === participant.sid);
    if (idx >= 0) lkParticipants.value[idx] = { ...lkParticipants.value[idx], name };
    log(`成员名称更新: ${JSON.stringify({ identity: participant.identity, name, sid: participant.sid, kind: participant.kind })}`, "info");
  });
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    lkParticipants.value = lkParticipants.value.filter(x => x.sid !== p.sid);
    log(`成员离开: ${JSON.stringify({ identity: p.identity, name: p.name, sid: p.sid, metadata: p.metadata })}`, "info");
  });
  room.on(RoomEvent.Disconnected, () => {
    log("语音连接已断开", "info");
    teardownVoice();
  });
  // v2: per-participant audio elements — supports multiple agents speaking simultaneously
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind === Track.Kind.Audio) {
      let el = _audioElements.get(participant.identity);
      if (!el) {
        el = document.createElement("audio");
        el.autoplay = true;
        document.body.appendChild(el);
        _audioElements.set(participant.identity, el);
      }
      track.attach(el);
      const roleLabel = participant.kind === 2 ? "🤖 Agent" : "👤 User";
      log(`收到 ${roleLabel} 音频流: ${participant.name || participant.identity}`, "ok");
    }
  });
  room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    track.detach();
    const el = _audioElements.get(participant.identity);
    if (el) {
      el.pause();
      el.srcObject = null;
      el.remove();
      _audioElements.delete(participant.identity);
    }
  });
  room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    speakingIdentities.value = speakers.map(s => s.identity);
  });
  room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: LkParticipantBase) => {
    const isLocal = participant?.identity === room.localParticipant.identity;
    const role = isLocal ? "user" : "agent";
    const speakerName = isLocal
      ? (room.localParticipant.name || userName.value || "我")
      : (lkParticipants.value.find(p => p.identity === participant?.identity)?.name || participant?.identity || "Agent");
    for (const seg of segments) {
      const idx = subtitleLines.value.findIndex(l => l.id === seg.id);
      if (idx >= 0) {
        subtitleLines.value[idx] = { id: seg.id, text: seg.text, role, speakerName, final: seg.final };
      } else {
        subtitleLines.value.push({ id: seg.id, text: seg.text, role, speakerName, final: seg.final });
      }
    }
    const finals = subtitleLines.value.filter(l => l.final).slice(-MAX_FINAL_SUBTITLES);
    const lives  = subtitleLines.value.filter(l => !l.final);
    subtitleLines.value = [...finals, ...lives];
  });

  subtitleLines.value = [];
  await room.connect(tokenRes.livekit_url, tokenRes.token);
  await room.localParticipant.setMicrophoneEnabled(true);
  micEnabled.value = true;
}

async function startVoice() {
  if (!sessionId.value.trim()) { log("请先创建 Session", "warn"); return; }
  voiceState.value = "connecting";
  log("获取 LiveKit Token...", "info");
  try {
    const tokenData = (userName.value || userId.value) ? { ...(userName.value ? { user_name: userName.value } : {}), ...(userId.value ? { user_id: userId.value } : {}) } : undefined;
    const tokenRes = await client.value!.agent.sessions.getLiveKitToken(sessionId.value, tokenData);
    log(`Token 获取成功，连接中... (显示名: "${userName.value || '未设置'}", user_id: "${userId.value || '未设置'}")`, "info");
    await _connectWithToken(tokenRes);
  } catch (err) {
    teardownVoice();
    logError(err);
  }
}

async function joinVoice() {
  if (!sessionId.value.trim()) { log("请先选择或输入 Session", "warn"); return; }
  voiceState.value = "connecting";
  log("加入已有 Session...", "info");
  try {
    const tokenData = (userName.value || userId.value) ? { ...(userName.value ? { user_name: userName.value } : {}), ...(userId.value ? { user_id: userId.value } : {}) } : undefined;
    const tokenRes = await client.value!.agent.sessions.join(sessionId.value, tokenData);
    log(`Token 获取成功，连接中... (显示名: "${userName.value || '未设置'}", user_id: "${userId.value || '未设置'}")`, "info");
    await _connectWithToken(tokenRes);
  } catch (err) {
    teardownVoice();
    logError(err);
  }
}

async function toggleMic() {
  if (!_lkRoom) return;
  micEnabled.value = !micEnabled.value;
  await _lkRoom.localParticipant.setMicrophoneEnabled(micEnabled.value);
  log(micEnabled.value ? "麦克风已开启" : "已静音", "info");
}

async function stopVoice() {
  if (!_lkRoom) return;
  voiceState.value = "disconnecting";
  await _lkRoom.disconnect();
}

onUnmounted(() => { _lkRoom?.disconnect(); });
</script>

<template>
  <div>
    <!-- Card 1: Room 列表 & 管理 -->
    <div class="card">
      <h3>Rooms</h3>
      <div class="row">
        <button class="btn btn-outline" @click="listRooms">获取 Room 列表</button>
        <button class="btn btn-outline" @click="loadAgents">加载 Agent 列表</button>
      </div>

      <table v-if="rooms.length" class="room-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>类型</th>
            <th>Visibility</th>
            <th>Talking Style</th>
            <th>Agents</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="room in rooms" :key="room.id">
            <td class="id-cell" :title="room.id">{{ room.id.slice(0, 8) }}…</td>
            <td>{{ room.name }}</td>
            <td>{{ room.room_type }}</td>
            <td><span :class="`visibility-${room.visibility}`">{{ room.visibility }}</span></td>
            <td>{{ room.talking_style }}</td>
            <td>{{ room.agent_ids.length }}</td>
            <td><span :class="`status-${room.status}`">{{ room.status }}</span></td>
            <td>{{ new Date(room.created_at).toLocaleString() }}</td>
            <td>
              <button class="btn btn-sm btn-outline" @click="startEditRoom(room)">编辑</button>
              <button class="btn btn-sm btn-outline" @click="() => { agentMgmtRoomId = room.id; listRoomAgents(); }">Agents</button>
              <button class="btn btn-sm btn-outline" @click="() => { startSessionRoomId = room.id; }">选为会话</button>
              <button class="btn btn-sm btn-danger" @click="deleteRoom(room.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 编辑表单 -->
      <div v-if="editingRoomId" class="sub-section">
        <h4>编辑 Room <span class="editing-id">{{ editingRoomId.slice(0, 8) }}…</span></h4>
        <div class="field">
          <label>名称</label>
          <input v-model="editRoomForm.name" type="text" />
        </div>
        <div class="field">
          <label>description</label>
          <input v-model="editRoomForm.description" type="text" />
        </div>
        <div class="field">
          <label>room_prompt</label>
          <textarea v-model="editRoomForm.room_prompt" rows="2" />
        </div>
        <div class="row">
          <div class="field">
            <label>visibility</label>
            <select v-model="editRoomForm.visibility">
              <option value="private">private</option>
              <option value="shared">shared</option>
              <option value="public">public</option>
            </select>
          </div>
          <div class="field">
            <label>talking_style</label>
            <select v-model="editRoomForm.talking_style">
              <option value="sequential">sequential</option>
              <option value="moderator_led">moderator_led</option>
              <option value="freeform">freeform</option>
            </select>
          </div>
        </div>
        <div class="field" v-if="editRoomForm.talking_style === 'freeform'">
          <label>speaking_rules</label>
          <textarea v-model="editRoomForm.speaking_rules" rows="2" placeholder="Freeform 模式的对话规则提示词" />
        </div>
        <div class="field">
          <label>agent_ids</label>
          <select v-model="editRoomForm.agent_ids" multiple class="multi-select">
            <option v-for="a in agentsList" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选</span>
        </div>
        <div class="field">
          <label>skill_ids</label>
          <select v-model="editRoomForm.skill_ids" multiple class="multi-select">
            <option v-for="s in skillsList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选 · <a href="#" @click.prevent="loadSkills">加载 Skill 列表</a></span>
        </div>
        <div class="field">
          <label>tool_ids</label>
          <select v-model="editRoomForm.tool_ids" multiple class="multi-select">
            <option v-for="t in toolsList" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选 · <a href="#" @click.prevent="loadTools">加载 Tool 列表</a></span>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveEditRoom">保存</button>
          <button class="btn btn-outline" @click="cancelEditRoom">取消</button>
        </div>
      </div>

      <!-- 创建 Room -->
      <div class="sub-section">
        <h4>创建 Room</h4>
        <div class="row">
          <div class="field">
            <label>名称 *</label>
            <input v-model="newRoom.name" type="text" placeholder="My Room" />
          </div>
          <div class="field">
            <label>room_type</label>
            <input v-model="newRoom.room_type" type="text" placeholder="direct" />
          </div>
        </div>
        <div class="field">
          <label>description</label>
          <input v-model="newRoom.description" type="text" placeholder="可选描述" />
        </div>
        <div class="field">
          <label>room_prompt</label>
          <textarea v-model="newRoom.room_prompt" rows="2" placeholder="注入到此 Room 所有 Session 的系统提示（可选）" />
        </div>
        <div class="row">
          <div class="field">
            <label>visibility</label>
            <select v-model="newRoom.visibility">
              <option value="private">private</option>
              <option value="shared">shared</option>
              <option value="public">public</option>
            </select>
          </div>
          <div class="field">
            <label>talking_style</label>
            <select v-model="newRoom.talking_style">
              <option value="sequential">sequential</option>
              <option value="moderator_led">moderator_led</option>
              <option value="freeform">freeform</option>
            </select>
          </div>
        </div>
        <div class="field" v-if="newRoom.talking_style === 'freeform'">
          <label>speaking_rules</label>
          <textarea v-model="newRoom.speaking_rules" rows="2" placeholder="Freeform 模式的对话规则提示词" />
        </div>
        <div class="field">
          <label>agent_ids</label>
          <select v-model="newRoom.agent_ids" multiple class="multi-select">
            <option v-for="a in agentsList" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选</span>
        </div>
        <div class="field">
          <label>skill_ids</label>
          <select v-model="newRoom.skill_ids" multiple class="multi-select">
            <option v-for="s in skillsList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选 · <a href="#" @click.prevent="loadSkills">加载 Skill 列表</a></span>
        </div>
        <div class="field">
          <label>tool_ids</label>
          <select v-model="newRoom.tool_ids" multiple class="multi-select">
            <option v-for="t in toolsList" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <span class="hint-text">按住 Ctrl / Cmd 多选 · <a href="#" @click.prevent="loadTools">加载 Tool 列表</a></span>
        </div>
        <button class="btn btn-primary" @click="createRoom">创建 Room</button>
      </div>
    </div>

    <!-- Card 2: Room Agents 管理 -->
    <div class="card">
      <h3>Room Agents 管理</h3>
      <div class="row">
        <div class="field">
          <label>选择 Room</label>
          <select v-model="agentMgmtRoomId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="listRoomAgents">查询 Agents</button>
        </div>
      </div>

      <div v-if="roomAgents" class="agent-list">
        <div v-if="!roomAgents.agent_ids.length" class="empty-tip">暂无 Agent</div>
        <div v-for="aid in roomAgents.agent_ids" :key="aid" class="agent-row">
          <span class="agent-id" :title="aid">{{ aid.slice(0, 8) }}… {{ aid }}</span>
          <button class="btn btn-sm btn-danger" @click="removeRoomAgent(aid)">移除</button>
        </div>
      </div>

      <div class="sub-section">
        <h4>添加 Agent</h4>
        <div class="row">
          <div class="field" style="flex:3">
            <label>选择 Agent</label>
            <select v-model="addAgentId">
              <option value="">— 请先加载 Agent 列表 —</option>
              <option v-for="a in agentsList" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div class="field" style="align-self:flex-end">
            <button class="btn btn-primary" @click="addRoomAgent">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Card 3: 查询 Room 详情 -->
    <div class="card">
      <h3>查询 Room 详情</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>选择 Room</label>
          <select v-model="getRoomId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="getRoom">查询</button>
        </div>
      </div>
      <div v-if="roomDetail" class="result-box">
        <div><strong>id:</strong> {{ roomDetail.id }}</div>
        <div><strong>name:</strong> {{ roomDetail.name }}</div>
        <div><strong>room_type:</strong> {{ roomDetail.room_type }}</div>
        <div><strong>status:</strong> <span :class="`status-${roomDetail.status}`">{{ roomDetail.status }}</span></div>
        <div><strong>visibility:</strong> {{ roomDetail.visibility }}</div>
        <div><strong>talking_style:</strong> {{ roomDetail.talking_style }}</div>
        <div v-if="roomDetail.speaking_rules"><strong>speaking_rules:</strong> {{ roomDetail.speaking_rules }}</div>
        <div><strong>room_prompt:</strong> {{ roomDetail.room_prompt || "—" }}</div>
        <div><strong>agent_ids:</strong> {{ roomDetail.agent_ids.length ? roomDetail.agent_ids.join(", ") : "—" }}</div>
        <div><strong>skill_ids:</strong> {{ roomDetail.skill_ids?.length ? roomDetail.skill_ids.join(", ") : "—" }}</div>
        <div><strong>tool_ids:</strong> {{ roomDetail.tool_ids?.length ? roomDetail.tool_ids.join(", ") : "—" }}</div>
        <div><strong>created_at:</strong> {{ new Date(roomDetail.created_at).toLocaleString() }}</div>
      </div>

      <LogBox :entries="entries" @clear="clear" />
    </div>

    <!-- Card 4: 在 Room 中创建 Session -->
    <div class="card">
      <h3>创建 Session（在 Room 中）</h3>
      <div class="row">
        <div class="field">
          <label>选择 Room</label>
          <select v-model="startSessionRoomId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>voice_id（可选覆盖）</label>
          <select v-model="startSessionVoiceId">
            <option value="">— 使用 Agent 默认 —</option>
            <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="loadVoiceList">加载声音列表</button>
          <button class="btn btn-primary" @click="startSession">创建 Session</button>
        </div>
      </div>

      <div v-if="startedSession" class="result-box">
        <div><strong>session_id:</strong> {{ startedSession.id }}</div>
        <div><strong>room_id:</strong> {{ startedSession.room_id }}</div>
        <div><strong>status:</strong> <span :class="`status-${startedSession.status}`">{{ startedSession.status }}</span></div>
        <div><strong>created_at:</strong> {{ new Date(startedSession.created_at).toLocaleString() }}</div>
      </div>
    </div>

    <!-- Card 4b: 查询 Room 已有 Session 列表 -->
    <div class="card">
      <h3>查询 Room Session 列表</h3>
      <div class="row">
        <div class="field">
          <label>选择 Room</label>
          <select v-model="listSessionsRoomId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="listRoomSessions">查询</button>
        </div>
      </div>

      <div v-if="roomSessions.length" class="table-wrap">
        <table class="room-table">
          <thead><tr><th>ID</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="s in roomSessions" :key="s.id">
              <td class="mono">{{ s.id }}</td>
              <td><span :class="`status-${s.status}`">{{ s.status }}</span></td>
              <td>{{ new Date(s.created_at).toLocaleString() }}</td>
              <td>
                <button class="btn btn-sm btn-outline" @click="sessionId = s.id">选用</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="listSessionsRoomId" class="empty-tip">暂无 Session，或尚未查询</div>
    </div>

    <!-- Card 5: Session 生命周期 -->
    <div class="card">
      <h3>Session 生命周期</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>session_id</label>
          <input v-model="sessionId" type="text" placeholder="从上方创建后自动填入，或手动输入" />
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

      <div class="sub-section">
        <div class="row">
          <h4 style="margin:0">会话成员</h4>
          <button class="btn btn-sm btn-outline" @click="getParticipants">刷新</button>
        </div>
        <div v-if="!participants.length" class="empty-tip">暂无成员</div>
        <div v-for="p in participants" :key="p.ref_id" class="agent-row">
          <span class="role-badge">{{ p.type }}</span>
          <span class="agent-id">{{ participantDisplayName(p) }}</span>
          <span class="agent-id ref-id-muted" :title="p.ref_id">{{ p.ref_id.slice(0, 8) }}…</span>
        </div>
      </div>
    </div>

    <!-- Card 6: 消息记录 -->
    <div class="card">
      <h3>消息记录</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>session_id</label>
          <input v-model="sessionId" type="text" placeholder="从上方创建后自动填入，或手动输入" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="loadMessages">加载消息</button>
        </div>
      </div>

      <div v-if="messages.length" class="message-list">
        <div v-for="msg in messages" :key="msg.id" :class="`message-item role-${msg.role}`">
          <span class="role-badge">
            {{ msg.role }}<template v-if="msg.speaker_type"> · {{ msg.speaker_type }}</template>
          </span>
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

    <!-- Card 7: 语音对话 -->
    <div class="card">
      <h3>语音对话</h3>
      <p class="hint">支持多 Agent + 多用户同时加入同一 Session 进行实时语音对话。</p>

      <div class="row" style="margin-bottom:0.5rem">
        <div class="field">
          <label>我的显示名</label>
          <input v-model="userName" type="text" placeholder="可选，其他成员可看到" :disabled="voiceState !== 'idle'" />
        </div>
        <div class="field">
          <label>我的用户 ID</label>
          <input v-model="userId" type="text" placeholder="可选，作为 LiveKit identity" :disabled="voiceState !== 'idle'" />
        </div>
      </div>

      <!-- v2: Session share row — allows copying session ID to invite more users -->
      <div v-if="sessionId" class="share-row">
        <span class="share-label">Session ID:</span>
        <code class="share-id" :title="sessionId">{{ sessionId.slice(0, 16) }}…</code>
        <button class="btn btn-sm btn-outline" @click="copySessionId">复制邀请 ID</button>
        <span class="hint-text">其他用户可用此 ID 点击「加入已有 Session」</span>
      </div>

      <div class="voice-status" :class="`vs-${voiceState}`">
        <span class="voice-dot" />
        <span>{{ { idle: "未连接", connecting: "连接中…", connected: "已连接", disconnecting: "断开中…" }[voiceState] }}</span>
        <span v-if="sessionId && voiceState !== 'idle'" class="voice-sid">{{ sessionId.slice(0, 8) }}…</span>
      </div>

      <!-- v2: participant pills with agent (🤖) / user (👤) distinction -->
      <div v-if="voiceState === 'connected'" class="speakers-row">
        <div class="speaker-pill" :class="{ speaking: speakingIdentities.includes(localIdentity) }">
          {{ micEnabled ? '🎤' : '🔇' }} {{ userName || localIdentity || '我' }}
        </div>
        <div
          v-for="p in lkParticipants"
          :key="p.sid"
          class="speaker-pill"
          :class="{ speaking: speakingIdentities.includes(p.identity), 'is-agent': p.kind === 2 }"
        >
          {{ p.kind === 2 ? '🤖' : '👤' }} {{ p.name || p.identity }}
        </div>
      </div>

      <div v-if="voiceState === 'connected'" class="subtitle-box">
        <div v-if="!subtitleLines.length" class="subtitle-empty">等待字幕…</div>
        <div
          v-for="line in subtitleLines"
          :key="line.id"
          :class="['subtitle-line', `sub-${line.role}`, { 'sub-live': !line.final }]"
        >
          <span class="sub-role">{{ line.speakerName }}</span>
          <span class="sub-text">{{ line.text }}</span>
          <span v-if="!line.final" class="sub-cursor">▋</span>
        </div>
      </div>

      <div class="btn-row">
        <template v-if="voiceState === 'idle'">
          <button class="btn btn-primary" @click="startVoice">📞 开始语音对话</button>
          <button class="btn btn-outline" @click="joinVoice">🔗 加入已有 Session</button>
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

      <!-- v2: audio elements are created dynamically per-participant in _audioElements Map -->
    </div>
  </div>
</template>

<style scoped>
.room-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.room-table th,
.room-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.room-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell, .mono {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
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
.agent-list {
  margin: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.agent-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.6rem;
  background: var(--bg-alt, #f8fafc);
  border-radius: 6px;
  font-size: 0.85rem;
}
.agent-id {
  font-family: monospace;
  flex: 1;
  font-size: 0.8rem;
  color: var(--text-muted, #374151);
}
.ref-id-muted {
  flex: 0;
  font-size: 0.75rem;
  color: var(--text-muted, #9ca3af);
  opacity: 0.6;
}
.empty-tip {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
  padding: 0.4rem 0;
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
.multi-select {
  width: 100%;
  min-height: 6rem;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  padding: 0.3rem;
  font-size: 0.85rem;
}
.hint-text {
  font-size: 0.72rem;
  color: var(--text-muted, #9ca3af);
  margin-top: 0.25rem;
  display: block;
}
.visibility-private { color: #6b7280; }
.visibility-shared  { color: #d97706; font-weight: 600; }
.visibility-public  { color: #16a34a; font-weight: 600; }
.status-active   { color: #16a34a; font-weight: 600; }
.status-paused   { color: #d97706; font-weight: 600; }
.status-ended    { color: #6b7280; }
.status-error    { color: #dc2626; font-weight: 600; }

/* Messages */
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

/* Voice */
.hint {
  font-size: 0.82rem;
  color: var(--text-muted, #9ca3af);
  margin: 0 0 0.75rem;
}
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
.lk-participants {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0;
  font-size: 0.82rem;
}
.lk-participant-label {
  color: var(--text-muted, #9ca3af);
}
.participant-chip {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: #1e293b;
  color: #94a3b8;
  font-family: monospace;
  font-size: 0.78rem;
}
/* v2: agent participant pill — purple tint to distinguish from user pills */
.speaker-pill.is-agent {
  background: var(--bg-agent, #ede9fe);
  border-color: #a78bfa;
  color: #5b21b6;
}
/* v2: session share row */
.share-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding: 0.4rem 0.75rem;
  background: var(--bg-alt, #f8fafc);
  border-radius: 6px;
  border: 1px dashed var(--border, #e2e8f0);
}
.share-label {
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  font-weight: 600;
}
.share-id {
  font-family: monospace;
  font-size: 0.8rem;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border, #e2e8f0);
  color: #374151;
}
</style>

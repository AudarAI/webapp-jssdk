<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { AgentResponse, MessageResponse, SkillResponse, KnowledgeResponse, ToolResponse, VoiceSessionResponse, VoiceSessionRequest, MediaOverrides, ModelInfo } from "@audarai/sdk";
import { Room, RoomEvent, Track, createLocalAudioTrack, setLogLevel, LogLevel, LoggerNames, type TranscriptionSegment, type Participant } from "livekit-client";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Agents ─────────────────────────────────────────────────────────────
const agents = ref<AgentResponse[]>([]);

// ── Dropdown data ────────────────────────────────────────────────────────────────
const skillList      = ref<SkillResponse[]>([]);
const knowledgeList  = ref<KnowledgeResponse[]>([]);
const toolList       = ref<ToolResponse[]>([]);
const voiceList      = ref<string[]>([]);
const sttModelList   = ref<ModelInfo[]>([]);
const ttsModelList   = ref<ModelInfo[]>([]);
const llmModelList   = ref<ModelInfo[]>([]);

async function loadDropdownData() {
  if (!client.value) return;
  const c = client.value;
  // Each list resolves independently — one failing endpoint must NOT blank
  // the other dropdowns. Errors are logged but don't propagate.
  const safe = <T,>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
    p.catch((err) => {
      logError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    });

  const [skills, knowledge, tools, voices, sttModels, ttsModels, llmModels] = await Promise.all([
    safe(c.agent.skills.list(),    [] as SkillResponse[],     "skills.list"),
    safe(c.agent.knowledge.list(), [] as KnowledgeResponse[], "knowledge.list"),
    safe(c.agent.tools.list(),     [] as ToolResponse[],      "tools.list"),
    safe(c.tts.listSpeakers(),     [] as string[],            "tts.listSpeakers"),
    safe(c.stt.listModels(),       [] as ModelInfo[],         "stt.listModels"),
    safe(c.tts.listModels(),       [] as ModelInfo[],         "tts.listModels"),
    safe(c.llm.listModels(),       [] as ModelInfo[],         "llm.listModels"),
  ]);
  skillList.value     = skills;
  knowledgeList.value = knowledge;
  toolList.value      = tools;
  voiceList.value     = voices;
  sttModelList.value  = sttModels;
  ttsModelList.value  = ttsModels;
  llmModelList.value  = llmModels;
}

// Auto-load dropdown data as soon as the client is ready, so the
// stt_model / tts_model / llm_model selectors are populated before the
// user has to click "Fetch Agent List".
watch(client, (c) => { if (c) loadDropdownData(); }, { immediate: true });

const newAgent = ref({
  name: "",
  description: "",
  system_prompt: "",
  voice_id: "",
  role: "",
  language: "",
  archetype_id: "",
  stt_model: "",
  tts_model: "",
  llm_model: "",
  is_public: false,
  skills: [] as string[],
  knowledge_bindings: [] as string[],
  tool_bindings: [] as string[],
  memory_enable: false,
  memory_turns: "" as number | "",
});

async function listAgents() {
  log("Fetching Agent list...", "info");
  try {
    [agents.value] = await Promise.all([
      client.value!.agent.listAgents(),
      loadDropdownData(),
    ]);
    log(`Found ${agents.value.length} Agent(s)`, "ok");
  } catch (err) {
    logError(err);
  }
}

const platformAgents = ref<AgentResponse[]>([]);

async function listPlatformAgents() {
  log("Fetching platform Agent list...", "info");
  try {
    platformAgents.value = await client.value!.agent.listPlatformAgents();
    log(`Found ${platformAgents.value.length} platform Agent(s)`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function createAgent() {
  if (!newAgent.value.name.trim()) { log("Please enter Agent name", "warn"); return; }
  log(`Creating Agent: ${newAgent.value.name}...`, "info");
  try {
    const created = await client.value!.agent.createAgent({
      name: newAgent.value.name,
      description: newAgent.value.description || undefined,
      system_prompt: newAgent.value.system_prompt || undefined,
      voice_id: newAgent.value.voice_id || undefined,
      role: newAgent.value.role || undefined,
      language: newAgent.value.language || undefined,
      archetype_id: newAgent.value.archetype_id || undefined,
      stt_model: newAgent.value.stt_model || undefined,
      tts_model: newAgent.value.tts_model || undefined,
      llm_model: newAgent.value.llm_model || undefined,
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
    log(`Agent created successfully: ${created.id}`, "ok");
    newAgent.value = { name: "", description: "", system_prompt: "", voice_id: "", role: "", language: "", archetype_id: "", stt_model: "", tts_model: "", llm_model: "", is_public: false, skills: [], knowledge_bindings: [], tool_bindings: [], memory_enable: false, memory_turns: "" };
  } catch (err) {
    logError(err);
  }
}

// ── Edit Agent ─────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editForm = ref({
  name: "",
  description: "",
  system_prompt: "",
  voice_id: "",
  role: "",
  language: "",
  archetype_id: "",
  stt_model: "",
  tts_model: "",
  llm_model: "",
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
    stt_model: a.stt_model ?? "",
    tts_model: a.tts_model ?? "",
    llm_model: a.llm_model ?? "",
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
  log(`Updating Agent: ${editingId.value}...`, "info");
  try {
    const updated = await client.value!.agent.updateAgent(editingId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
      system_prompt: editForm.value.system_prompt || undefined,
      voice_id: editForm.value.voice_id || undefined,
      role: editForm.value.role || undefined,
      language: editForm.value.language || undefined,
      archetype_id: editForm.value.archetype_id || undefined,
      stt_model: editForm.value.stt_model || undefined,
      tts_model: editForm.value.tts_model || undefined,
      llm_model: editForm.value.llm_model || undefined,
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
    log(`Agent updated successfully: ${updated.id}`, "ok");
    editingId.value = null;
  } catch (err) {
    logError(err);
  }
}

async function deleteAgent(id: string) {
  log(`Deleting Agent: ${id}...`, "info");
  try {
    await client.value!.agent.deleteAgent(id);
    agents.value = agents.value.filter(a => a.id !== id);
    log("Deleted successfully", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 4: Messages ────────────────────────────────────────────────────────────
const msgSessionId = ref("");
const messages = ref<MessageResponse[]>([]);

async function loadMessages() {
  if (!msgSessionId.value.trim()) { log("Please enter session_id", "warn"); return; }
  log("Loading messages...", "info");
  try {
    const res = await client.value!.agent.sessions.listMessages(msgSessionId.value);
    // Backend may return a flat array or a {messages, total} wrapper
    messages.value = res.data ?? [];
    const total = res.total ?? messages.value.length;
    log(`Found ${total} message(s)`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 5: Voice Chat ────────────────────────────────────────────────────────────
type VoiceState = "idle" | "connecting" | "connected" | "disconnecting";

const voiceAgentId       = ref("");
const voiceInitMsg       = ref("Hello");
const voiceVoiceId       = ref("");
const userName           = ref("");
const userId             = ref("");

// Session-start overrides (all optional)
const voiceLanguage           = ref("");
const voiceRoomName           = ref("");
const voiceMaxDuration        = ref<number | "">("");
const voiceInactivityTimeout  = ref<number | "">("");
const voiceRecordingEnabled   = ref(false);
const voiceRecordingFormat    = ref<"" | "mp4" | "ogg" | "mp3">("");
const voiceRecordingLayout    = ref("");
const voiceVariablesJson      = ref("");
const voiceWebhookMetaJson    = ref("");

function randomizeUser() {
  const rand = () => Math.random().toString(36).slice(2, 6);
  userName.value = `User_${rand()}`;
  userId.value   = `user_${rand()}${rand()}`;
}
const voiceState         = ref<VoiceState>("idle");
const voiceSessionId     = ref("");
const voiceSessionInfo   = ref<VoiceSessionResponse | null>(null);
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
  voiceSessionInfo.value = null;
  voiceState.value = "idle";
  // 断开后自动为下次通话预热
  if (_cachedLivekitUrl) _prewarmLiveKit(_cachedLivekitUrl);
}

// ── LiveKit debug 日志：在浏览器 Console 查看连接各阶段详情 ──────────────
setLogLevel(LogLevel.debug, LoggerNames.Signal);
setLogLevel(LogLevel.debug, LoggerNames.Engine);
setLogLevel(LogLevel.debug, LoggerNames.PCTransport);

let _connectStart = 0;

/** Create Room + attach all event listeners (sync, no I/O). */
function _prepareRoom(): Room {
  const room = new Room({
    adaptiveStream: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  _room = room;

  room.on(RoomEvent.SignalConnected, () => {
    if (_connectStart) log(`  → SignalConnected: ${(performance.now() - _connectStart).toFixed(0)}ms`, "info");
  });
  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (_connectStart) log(`  → ConnectionState: ${state} @ ${(performance.now() - _connectStart).toFixed(0)}ms`, "info");
  });

  room.on(RoomEvent.Connected, () => {
    voiceState.value = "connected";
    localIdentity.value = room.localParticipant.identity;
    lkParticipants.value = Array.from(room.remoteParticipants.values())
      .map(p => ({ identity: p.identity, name: p.name, sid: p.sid }));
    log(`Connected to voice room — local participant: identity="${room.localParticipant.identity}", name="${room.localParticipant.name}"`, "ok");
  });
  room.on(RoomEvent.ParticipantConnected, (p) => {
    lkParticipants.value.push({ identity: p.identity, name: p.name, sid: p.sid });
    log(`Participant joined: identity="${p.identity}", name="${p.name}"`, "info");
  });
  room.on(RoomEvent.ParticipantNameChanged, (name, participant) => {
    const idx = lkParticipants.value.findIndex(p => p.sid === participant.sid);
    if (idx >= 0) lkParticipants.value[idx] = { ...lkParticipants.value[idx], name };
  });
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    lkParticipants.value = lkParticipants.value.filter(x => x.sid !== p.sid);
    log(`Participant left: identity="${p.identity}"`, "info");
  });

  room.on(RoomEvent.Disconnected, () => {
    log("Voice connection disconnected", "info");
    teardownRoom();
  });

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio && audioEl.value) {
      track.attach(audioEl.value);
      log("Received Agent audio stream", "ok");
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

// ── Mic pre-warm: acquire permission on page load, not on click ────────────
let _micWarmed = false;
function _warmMicrophone(): Promise<void> {
  if (_micWarmed) return Promise.resolve();
  return navigator.mediaDevices.getUserMedia({ audio: true })
    .then(s => { s.getTracks().forEach(t => t.stop()); _micWarmed = true; })
    .catch(() => {});
}
// Fire immediately — browser caches the grant for all subsequent getUserMedia calls
_warmMicrophone();

// ── LiveKit pre-warm: pre-create Room + signal connection ─────────────────
// prepareConnection 提前建立 WebSocket 信令 + ICE 收集，后续 room.connect 只需交换 join (~200ms)
let _prewarmedRoom: Room | null = null;
function _prewarmLiveKit(): void {
  const livekitUrl = (client.value as any)?.livekitUrl as string | undefined;
  if (!livekitUrl || _prewarmedRoom) return;
  _prewarmedRoom = _prepareRoom();
  _prewarmedRoom.prepareConnection(livekitUrl);
}
_prewarmLiveKit();

async function _connectRoom(
  room: Room,
  tokenRes: { token: string; livekit_url: string },
): Promise<void> {
  _connectStart = performance.now();

  // ── Hook into RTCPeerConnection events for fine-grained WebRTC timing ──
  // We intercept RTCPeerConnection creation to attach state-change listeners
  // BEFORE room.connect() starts the negotiation sequence.
  const _origCreate = window.RTCPeerConnection;
  const _cs = _connectStart;
  const _log = log;
  window.RTCPeerConnection = new Proxy(_origCreate, {
    construct(target, args) {
      const pc = new target(...args);
      pc.addEventListener("signalingstatechange", () => {
        _log(`  → PC signaling: ${pc.signalingState} @ ${(performance.now() - _cs).toFixed(0)}ms`, "info");
      });
      pc.addEventListener("iceconnectionstatechange", () => {
        _log(`  → PC ice: ${pc.iceConnectionState} @ ${(performance.now() - _cs).toFixed(0)}ms`, "info");
      });
      pc.addEventListener("icegatheringstatechange", () => {
        _log(`  → PC iceGathering: ${pc.iceGatheringState} @ ${(performance.now() - _cs).toFixed(0)}ms`, "info");
      });
      pc.addEventListener("connectionstatechange", () => {
        _log(`  → PC connection: ${pc.connectionState} @ ${(performance.now() - _cs).toFixed(0)}ms`, "info");
      });
      return pc;
    },
  }) as any;

  // Parallel: room.connect (WebSocket + SDP + ICE + DTLS) ‖ create audio track (getUserMedia)
  // 分别计时以定位瓶颈
  const connectPromise = room.connect(tokenRes.livekit_url, tokenRes.token, {
    peerConnectionTimeout: 5_000, // LAN should connect in <1s, fail fast
  })
    .then(async () => {
      log(`  → room.connect 完成: ${(performance.now() - _connectStart).toFixed(0)}ms`, "info");
      // Dump WebRTC transport stats for post-hoc analysis
      try {
        const pc = (room as any).engine?.pcManager?.publisher?.pc as RTCPeerConnection | undefined;
        if (pc) {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.nominated) {
              log(`  → ICE pair: rtt=${report.currentRoundTripTime ? (report.currentRoundTripTime * 1000).toFixed(0) + "ms" : "N/A"} local=${report.localCandidateId} remote=${report.remoteCandidateId}`, "info");
            }
            if (report.type === "transport") {
              log(`  → DTLS: state=${report.dtlsState} tlsVersion=${report.tlsVersion ?? "N/A"} selectedPair=${report.selectedCandidatePairId ?? "N/A"}`, "info");
            }
          });
        }
      } catch { /* stats not critical */ }
    });

  // Restore original RTCPeerConnection after proxy is consumed
  window.RTCPeerConnection = _origCreate;

  const audioPromise = createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
    .then(track => {
      log(`  → createLocalAudioTrack 完成: ${(performance.now() - _connectStart).toFixed(0)}ms`, "info");
      return track;
    });

  const [, audioTrack] = await Promise.all([connectPromise, audioPromise]);
  log(`room.connect 总计 (parallel): ${(performance.now() - _connectStart).toFixed(0)}ms`, "info");

  // Publish pre-created track — no second getUserMedia needed
  const t2 = performance.now();
  await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone });
  log(`publishTrack: ${(performance.now() - t2).toFixed(0)}ms`, "info");
  micEnabled.value = true;
}

async function startVoice() {
  if (!voiceAgentId.value) { log("Please select an Agent", "warn"); return; }
  voiceState.value = "connecting";
  const t0 = performance.now();
  log("Starting voice chat...", "info");
  try {
    // 1. Reuse pre-warmed Room (ICE + signal already established) or create fresh
    const wasPrewarmed = !!_prewarmedRoom;
    const tRoom = performance.now();
    const room = _prewarmedRoom || _prepareRoom();
    _prewarmedRoom = null;
    log(`  prepareRoom: ${(performance.now() - tRoom).toFixed(0)}ms (prewarmed=${wasPrewarmed})`, "info");

    // 2. API call (mic already warmed at page load)
    const tApi = performance.now();
    const opts: VoiceSessionRequest = {
      message: voiceInitMsg.value || "Hello",
      ...(voiceVoiceId.value ? { voice_id: voiceVoiceId.value } : {}),
      ...(userName.value ? { user_name: userName.value } : {}),
      ...(userId.value ? { user_id: userId.value } : {}),
      ...(voiceLanguage.value ? { language: voiceLanguage.value } : {}),
      ...(voiceRoomName.value ? { room_name: voiceRoomName.value } : {}),
      ...(voiceMaxDuration.value !== "" ? { max_duration_seconds: Number(voiceMaxDuration.value) } : {}),
      ...(voiceInactivityTimeout.value !== "" ? { inactivity_timeout_seconds: Number(voiceInactivityTimeout.value) } : {}),
    };
    const parseJsonOpt = (label: string, raw: string): Record<string, unknown> | undefined => {
      if (!raw.trim()) return undefined;
      try { return JSON.parse(raw); }
      catch (e) {
        logError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    };
    const variables = parseJsonOpt("variables", voiceVariablesJson.value);
    if (variables) opts.variables = variables;
    const wh = parseJsonOpt("webhook_metadata", voiceWebhookMetaJson.value);
    if (wh) opts.webhook_metadata = wh;
    if (voiceRecordingEnabled.value || voiceRecordingFormat.value || voiceRecordingLayout.value) {
      const mo: MediaOverrides = {};
      if (voiceRecordingEnabled.value) mo.recording_enabled = true;
      if (voiceRecordingFormat.value) mo.recording_format = voiceRecordingFormat.value;
      if (voiceRecordingLayout.value) mo.recording_layout = voiceRecordingLayout.value;
      opts.media_overrides = mo;
    }
    const res = await client.value!.agent.createVoiceSession(voiceAgentId.value, opts);

    voiceSessionId.value = res.session_id;
    voiceSessionInfo.value = res;
    log(`API response: ${(performance.now() - tApi).toFixed(0)}ms — session: ${res.session_id}`, "info");

    // 3. Connect + create audio track in parallel (fast if pre-warmed)
    await _connectRoom(room, res);
    log(`Total time: ${(performance.now() - t0).toFixed(0)}ms`, "ok");
  } catch (err) {
    teardownRoom();
    logError(err);
  }
}

async function joinVoice() {
  if (!joinSessionId.value.trim()) { log("Please enter session_id to join", "warn"); return; }
  voiceState.value = "connecting";
  const t0 = performance.now();
  log("Joining existing Session...", "info");
  try {
    const room = _prewarmedRoom || _prepareRoom();
    _prewarmedRoom = null;

    const tokenData = (userName.value || userId.value) ? { ...(userName.value ? { user_name: userName.value } : {}), ...(userId.value ? { user_id: userId.value } : {}) } : undefined;
    const tokenRes = await client.value!.agent.sessions.join(joinSessionId.value, tokenData);

    voiceSessionId.value = joinSessionId.value;
    log(`API response: ${(performance.now() - t0).toFixed(0)}ms`, "info");

    await _connectRoom(room, tokenRes);
    log(`Total time: ${(performance.now() - t0).toFixed(0)}ms`, "ok");
  } catch (err) {
    teardownRoom();
    logError(err);
  }
}

async function toggleMic() {
  if (!_room) return;
  micEnabled.value = !micEnabled.value;
  await _room.localParticipant.setMicrophoneEnabled(micEnabled.value);
  log(micEnabled.value ? "Microphone enabled" : "Muted", "info");
}

async function stopVoice() {
  if (!_room) return;
  voiceState.value = "disconnecting";
  await _room.disconnect();
}

onUnmounted(() => {
  _room?.disconnect();
  if (_prewarmedRoom) { _prewarmedRoom.removeAllListeners(); _prewarmedRoom = null; }
});

</script>

<template>
  <div>
    <!-- Card 1: Agents -->
    <div class="card">
      <h3>Agents</h3>
      <div class="row">
        <button class="btn btn-outline" @click="listAgents">Fetch Agent List</button>
        <button class="btn btn-outline" @click="listPlatformAgents">Fetch Platform Agents</button>
        <button class="btn btn-outline" @click="loadDropdownData">Refresh Dropdowns</button>
      </div>

      <table v-if="platformAgents.length" class="agent-table">
        <caption style="text-align:left;font-size:0.8rem;color:var(--text-muted,#6b7280);margin-bottom:0.3rem">Platform Agents (read-only, available to all tenants)</caption>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Language</th>
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
            <th>Name</th>
            <th>Language</th>
            <th>voice_id</th>
            <th>stt_model</th>
            <th>tts_model</th>
            <th>llm_model</th>
            <th>role</th>
            <th>skills</th>
            <th>knowledge</th>
            <th>tools</th>
            <th>memory</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in agents" :key="agent.id">
            <td class="id-cell" :title="agent.id">{{ agent.id.slice(0, 8) }}…</td>
            <td>{{ agent.name }}</td>
            <td>{{ agent.language ?? "—" }}</td>
            <td>{{ agent.voice_id ?? "—" }}</td>
            <td>{{ agent.stt_model ?? "—" }}</td>
            <td>{{ agent.tts_model ?? "—" }}</td>
            <td>{{ agent.llm_model ?? "—" }}</td>
            <td>{{ agent.role ?? "—" }}</td>
            <td>{{ agent.skills.length }}</td>
            <td>{{ agent.knowledge_bindings.length }}</td>
            <td>{{ agent.tool_bindings.length }}</td>
            <td>{{ agent.memory_policy?.enable_memory ? "✓" : "✗" }}</td>
            <td>{{ new Date(agent.created_at).toLocaleString() }}</td>
            <td>
              <button class="btn btn-sm btn-outline" @click="startEdit(agent)">Edit</button>
              <button class="btn btn-sm btn-danger" @click="deleteAgent(agent.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 编辑表单 -->
      <div v-if="editingId" class="sub-section">
        <h4>Edit Agent <span class="editing-id">{{ editingId.slice(0, 8) }}…</span></h4>
        <div class="row">
          <div class="field">
            <label>Name</label>
            <input v-model="editForm.name" type="text" />
          </div>
          <div class="field">
            <label>language</label>
            <input v-model="editForm.language" type="text" placeholder="zh-CN" />
          </div>
          <div class="field">
            <label>voice_id</label>
            <select v-model="editForm.voice_id">
              <option value="">— Not Set —</option>
              <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>stt_model</label>
            <small class="field-tip">STT model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="editForm.stt_model">
              <option value="">— Default —</option>
              <option v-for="m in sttModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>tts_model</label>
            <small class="field-tip">TTS model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="editForm.tts_model">
              <option value="">— Default —</option>
              <option v-for="m in ttsModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>llm_model</label>
            <small class="field-tip">LLM model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="editForm.llm_model">
              <option value="">— Default —</option>
              <option v-for="m in llmModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>role</label>
            <small class="field-tip">Affects behavior indirectly — not injected into LLM prompt. Written to agents_metadata and passed to the LiveKit worker; used in multi-agent scenarios to identify agent identity and Orchestrator routing.</small>
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
          <small class="field-tip">Pure metadata — does not affect the prompt, is not passed to the LiveKit worker, and does not enter the LLM. Used only for API responses and management UI display.</small>
          <input v-model="editForm.description" type="text" />
        </div>
        <div class="field">
          <label>system_prompt</label>
          <small class="field-tip">Highest-priority system instruction injected directly into the LLM. Priority: agent.system_prompt → identity["instructions"] → archetype.base_prompt → DEFAULT_INSTRUCTIONS. Final value is concatenated as system_prompt + "\n" + TTS_RULES.</small>
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
            <input v-model.number="editForm.memory_turns" type="number" min="1" placeholder="optional" />
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveEdit">Save</button>
          <button class="btn btn-outline" @click="cancelEdit">Cancel</button>
        </div>
      </div>

      <div class="sub-section">
        <h4>Create Agent</h4>
        <div class="row">
          <div class="field">
            <label>Name *</label>
            <input v-model="newAgent.name" type="text" placeholder="My Agent" />
          </div>
          <div class="field">
            <label>language</label>
            <input v-model="newAgent.language" type="text" placeholder="zh-CN" />
          </div>
          <div class="field">
            <label>voice_id</label>
            <select v-model="newAgent.voice_id">
              <option value="">— Not Set —</option>
              <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>stt_model</label>
            <small class="field-tip">STT model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="newAgent.stt_model">
              <option value="">— Default —</option>
              <option v-for="m in sttModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>tts_model</label>
            <small class="field-tip">TTS model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="newAgent.tts_model">
              <option value="">— Default —</option>
              <option v-for="m in ttsModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>llm_model</label>
            <small class="field-tip">LLM model handle. Falls back to tenant/system default when not set.</small>
            <select v-model="newAgent.llm_model">
              <option value="">— Default —</option>
              <option v-for="m in llmModelList" :key="m.name" :value="m.name">
                {{ m.display_name }} ({{ m.name }}){{ m.is_default ? " · default" : "" }}
              </option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>role</label>
            <small class="field-tip">Affects behavior indirectly — not injected into LLM prompt. Written to agents_metadata and passed to the LiveKit worker; used in multi-agent scenarios to identify agent identity and Orchestrator routing.</small>
            <input v-model="newAgent.role" type="text" placeholder="Role description (optional)" />
          </div>
          <div class="field">
            <label>archetype_id</label>
            <input v-model="newAgent.archetype_id" type="text" placeholder="Archetype UUID (optional)" />
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
          <small class="field-tip">Pure metadata — does not affect the prompt, is not passed to the LiveKit worker, and does not enter the LLM. Used only for API responses and management UI display.</small>
          <input v-model="newAgent.description" type="text" placeholder="Optional description" />
        </div>
        <div class="field">
          <label>system_prompt</label>
          <small class="field-tip">Highest-priority system instruction injected directly into the LLM. Priority: agent.system_prompt → identity["instructions"] → archetype.base_prompt → DEFAULT_INSTRUCTIONS. Final value is concatenated as system_prompt + "\n" + TTS_RULES.</small>
          <textarea v-model="newAgent.system_prompt" rows="2" placeholder="System prompt (optional)" />
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
            <input v-model.number="newAgent.memory_turns" type="number" min="1" placeholder="optional" />
          </div>
        </div>
        <button class="btn btn-primary" @click="createAgent">Create Agent</button>
      </div>
    </div>

    <!-- Card 5: 语音对话 -->
    <div class="card">
      <h3>Voice Chat</h3>
      <div class="row">
        <div class="field">
          <label>Select Agent</label>
          <select v-model="voiceAgentId">
            <option value="">— Fetch list first —</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Opening message</label>
          <input v-model="voiceInitMsg" type="text" placeholder="Hello" />
        </div>
        <div class="field">
          <label>voice_id (optional override)</label>
          <select v-model="voiceVoiceId">
            <option value="">— Use Agent default —</option>
            <option v-for="v in voiceList" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
        <div class="field">
          <label>Display name</label>
          <input v-model="userName" type="text" placeholder="optional" />
        </div>
        <div class="field">
          <label>User ID</label>
          <input v-model="userId" type="text" placeholder="Optional, used as LiveKit identity" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="randomizeUser">Random</button>
        </div>
      </div>

      <!-- Session-start overrides -->
      <div class="row">
        <div class="field">
          <label>language (override)</label>
          <input v-model="voiceLanguage" type="text" placeholder="en / zh / ja …" />
        </div>
        <div class="field">
          <label>room_name (display)</label>
          <input v-model="voiceRoomName" type="text" placeholder="optional, business name" />
        </div>
        <div class="field">
          <label>max_duration_seconds</label>
          <input v-model.number="voiceMaxDuration" type="number" min="1" placeholder="auto-end after N s" />
        </div>
        <div class="field">
          <label>inactivity_timeout_seconds</label>
          <input v-model.number="voiceInactivityTimeout" type="number" min="1" placeholder="end after N s idle" />
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label><input v-model="voiceRecordingEnabled" type="checkbox" /> recording_enabled</label>
        </div>
        <div class="field">
          <label>recording_format</label>
          <select v-model="voiceRecordingFormat">
            <option value="">— default (mp4) —</option>
            <option value="mp4">mp4</option>
            <option value="ogg">ogg</option>
            <option value="mp3">mp3</option>
          </select>
        </div>
        <div class="field">
          <label>recording_layout</label>
          <input v-model="voiceRecordingLayout" type="text" placeholder="speaker / grid / …" />
        </div>
      </div>

      <div class="row">
        <div class="field" style="flex:1">
          <label>variables (JSON)</label>
          <textarea
            v-model="voiceVariablesJson"
            rows="2"
            placeholder='{"name":"Alice","task":"demo"}'
            style="width:100%;font-family:monospace"
          ></textarea>
        </div>
        <div class="field" style="flex:1">
          <label>webhook_metadata (JSON)</label>
          <textarea
            v-model="voiceWebhookMetaJson"
            rows="2"
            placeholder='{"data_id":"x","user_id":"y","mode":"live"}'
            style="width:100%;font-family:monospace"
          ></textarea>
        </div>
      </div>

      <div class="voice-status" :class="`vs-${voiceState}`">
        <span class="voice-dot" />
        <span>{{ { idle: "Not connected", connecting: "Connecting…", connected: "Connected", disconnecting: "Disconnecting…" }[voiceState] }}</span>
        <span v-if="voiceSessionId && voiceState !== 'idle'" class="voice-sid">{{ voiceSessionId.slice(0, 8) }}…</span>
      </div>

      <div v-if="voiceSessionInfo && voiceState !== 'idle'" class="session-info">
        <div><strong>session_id:</strong> <span class="mono">{{ voiceSessionInfo.session_id }}</span></div>
        <div><strong>room_id:</strong> <span class="mono">{{ voiceSessionInfo.room_id }}</span></div>
        <div><strong>room_name:</strong> <span class="mono">{{ voiceSessionInfo.room_name }}</span></div>
        <div><strong>livekit_url:</strong> <span class="mono">{{ voiceSessionInfo.livekit_url }}</span></div>
      </div>

      <div v-if="voiceState === 'connected'" class="speakers-row">
        <div class="speaker-pill" :class="{ speaking: speakingIdentities.includes(localIdentity) }">
          {{ micEnabled ? '🎤' : '🔇' }} {{ userName || localIdentity || 'Me' }}
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
        <div v-if="!subtitleLines.length" class="subtitle-empty">Waiting for captions…</div>
        <div
          v-for="line in subtitleLines"
          :key="line.id"
          :class="['subtitle-line', `sub-${line.role}`, { 'sub-live': !line.final }]"
        >
          <span class="sub-role">{{ line.role === "user" ? "Me" : "Agent" }}</span>
          <span class="sub-text">{{ line.text }}</span>
          <span v-if="!line.final" class="sub-cursor">▋</span>
        </div>
      </div>

      <div class="sub-section">
        <h4>Join Existing Session</h4>
        <div class="row">
          <div class="field" style="flex:3">
            <label>session_id</label>
            <input v-model="joinSessionId" type="text" placeholder="ID of an active session" :disabled="voiceState !== 'idle'" />
          </div>
        </div>
        <p class="hint">Use this when the session is already in preparing / running state — no new room will be created.</p>
      </div>

      <div class="btn-row">
        <template v-if="voiceState === 'idle'">
          <button class="btn btn-primary" @click="startVoice">📞 Start Voice Chat</button>
          <button class="btn btn-outline" :disabled="!joinSessionId" @click="joinVoice">🔗 Join Existing Session</button>
        </template>
        <template v-else-if="voiceState === 'connected'">
          <button class="btn btn-outline" @click="toggleMic">
            {{ micEnabled ? "🔇 Mute" : "🎤 Unmute" }}
          </button>
          <button class="btn btn-danger" @click="stopVoice">📵 Hang Up</button>
        </template>
        <button v-else class="btn btn-outline" disabled>
          {{ voiceState === "connecting" ? "Connecting…" : "Disconnecting…" }}
        </button>
      </div>

      <!-- hidden audio output for agent voice -->
      <audio ref="audioEl" autoplay style="display:none" />
    </div>

    <!-- Card 4: 消息记录 -->
    <div class="card">
      <h3>Messages</h3>
      <div class="row">
        <div class="field" style="flex:3">
          <label>session_id</label>
          <input v-model="msgSessionId" type="text" placeholder="Auto-filled from Chat, or enter manually" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="loadMessages">Load Messages</button>
        </div>
      </div>

      <div v-if="messages.length" class="message-list">
        <div v-for="msg in messages" :key="msg.id" :class="`message-item role-${msg.role}`">
          <span class="role-badge">{{ msg.role }}<template v-if="msg.speaker_type"> · {{ msg.speaker_type }}</template></span>
          <span class="msg-content">{{ msg.content }}</span>
          <span class="msg-time">#{{ msg.seq_num }} {{ new Date(msg.created_at).toLocaleTimeString() }}</span>
        </div>
      </div>

    </div>

    <LogBox :entries="entries" />
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

/* Session info */
.session-info {
  margin: 0.5rem 0 0.75rem;
  padding: 0.6rem 0.8rem;
  background: var(--bg-alt, #f8fafc);
  border-radius: 6px;
  font-size: 0.82rem;
  line-height: 1.8;
}
.session-info .mono {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
  user-select: all;
}

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

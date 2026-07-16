<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ModelInfo, Speaker, TimestampMark, TimedStreamEvent } from "@audarai/sdk";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import { base64ToArrayBuffer, bufferToObjectUrl, downloadBuffer, fmtSize, pcmToWav } from "../utils/audio";
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

// ── Timed synthesis (句/块级 highlight) ───────────────────────────────────────
const marks     = ref<TimestampMark[]>([]);
const readText  = ref("");   // the text the current marks belong to
const activeIdx = ref(-1);   // index of the chunk currently being read

// ── Reference audio playback (test for getSpeakerAudio) ───────────────────────
const playingSpeaker       = ref<string | null>(null);
const speakerAudioLoading  = ref<string | null>(null);

async function playSpeakerAudio(name: string) {
  if (!client.value) return;
  if (playingSpeaker.value === name && audioEl.value && !audioEl.value.paused) {
    audioEl.value.pause();
    playingSpeaker.value = null;
    return;
  }
  speakerAudioLoading.value = name;
  log(`Fetching reference audio for "${name}"...`, "info");
  try {
    const blob = await client.value.tts.getSpeakerAudio(name);
    log(`Got reference audio: ${fmtSize(blob.size)} (${blob.type || "unknown"})`, "ok");
    if (audioSrc.value) URL.revokeObjectURL(audioSrc.value);
    audioSrc.value = URL.createObjectURL(blob);
    await nextTick();
    const el = audioEl.value;
    if (el) {
      const onEnded = () => {
        playingSpeaker.value = null;
        el.removeEventListener("ended", onEnded);
      };
      el.addEventListener("ended", onEnded);
      await el.play();
      playingSpeaker.value = name;
    }
  } catch (err) {
    playingSpeaker.value = null;
    logError(err);
  } finally {
    speakerAudioLoading.value = null;
  }
}

// ── Edit / rename / replace audio (SDK 0.5.0+) ────────────────────────────────
const editTarget = ref<string>("");
const editDesc = ref<string>("");
const editGender = ref<string>("");
const editLanguage = ref<string>("");
const editAccent = ref<string>("");
const editTone = ref<string>("");
const editDuration = ref<string>("");
const editTags = ref<string>("");
const editCompat = ref<Set<string>>(new Set());
const editRenameTo = ref<string>("");
const editReplaceFile = ref<File | null>(null);
const editReplaceTranscript = ref<string>("");
const editSaving = ref(false);

const editSpeaker = computed<Speaker | null>(() =>
  speakers.value.find((s) => s.name === editTarget.value) ?? null,
);

function hydrateEditForm(s: Speaker | null) {
  editDesc.value = s?.description ?? "";
  const m = s?.metadata ?? {};
  editGender.value = (m.gender as string | undefined) ?? "";
  editLanguage.value = (m.language as string | undefined) ?? "";
  editAccent.value = (m.accent as string | undefined) ?? "";
  editTone.value = (m.tone as string | undefined) ?? "";
  editDuration.value =
    typeof m.duration_s === "number" ? String(m.duration_s) : "";
  editTags.value = ((m.expression_tags as string[] | undefined) ?? []).join(", ");
  editCompat.value = new Set(s?.compatible_models ?? []);
  editRenameTo.value = s?.name ?? "";
  editReplaceFile.value = null;
  editReplaceTranscript.value = "";
}

// Re-seed the form whenever the selected target (or the underlying list) changes.
watch(editSpeaker, (s) => hydrateEditForm(s), { immediate: true });
// When the speaker list refreshes, default the edit target to the currently
// chosen voice (or the first speaker available).
watch(speakers, (list) => {
  if (!list.length) {
    editTarget.value = "";
    return;
  }
  if (!list.some((s) => s.name === editTarget.value)) {
    editTarget.value = voice.value && list.some((s) => s.name === voice.value)
      ? voice.value
      : list[0].name;
  }
});

function toggleEditCompat(name: string) {
  const next = new Set(editCompat.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  editCompat.value = next;
}

function buildMetadataFromForm() {
  const tags = editTags.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const duration = editDuration.value.trim()
    ? Number(editDuration.value.trim())
    : undefined;
  return {
    gender: editGender.value.trim() || undefined,
    language: editLanguage.value.trim() || undefined,
    accent: editAccent.value.trim() || undefined,
    tone: editTone.value.trim() || undefined,
    duration_s: duration != null && !Number.isNaN(duration) ? duration : undefined,
    expression_tags: tags.length > 0 ? tags : undefined,
  };
}

async function saveSpeakerEdits() {
  if (!client.value || !editSpeaker.value) return;
  const name = editSpeaker.value.name;
  editSaving.value = true;
  log(`Patching speaker "${name}" (description/metadata/compatible_models)...`, "info");
  try {
    const res = await client.value.tts.updateSpeaker(name, {
      description: editDesc.value,
      compatibleModels: Array.from(editCompat.value),
      metadata: buildMetadataFromForm(),
    });
    log(`updateSpeaker: ${res.message}`, res.success ? "ok" : "warn");
    await refreshSpeakers({ silent: true });
  } catch (err) {
    logError(err);
  } finally {
    editSaving.value = false;
  }
}

async function renameSelectedSpeaker() {
  if (!client.value || !editSpeaker.value) return;
  const from = editSpeaker.value.name;
  const to = editRenameTo.value.trim();
  if (!to || to === from) {
    log("Rename: new name is empty or unchanged", "warn");
    return;
  }
  editSaving.value = true;
  log(`Renaming "${from}" → "${to}"...`, "info");
  try {
    const res = await client.value.tts.renameSpeaker(from, to);
    log(`renameSpeaker: ${res.message}`, res.success ? "ok" : "warn");
    await refreshSpeakers({ silent: true });
    if (res.success) {
      editTarget.value = to;
      if (voice.value === from) voice.value = to;
    }
  } catch (err) {
    logError(err);
  } finally {
    editSaving.value = false;
  }
}

function handleReplaceFile(e: Event) {
  const input = e.target as HTMLInputElement;
  editReplaceFile.value = input.files?.[0] ?? null;
}

async function replaceSelectedAudio() {
  if (!client.value || !editSpeaker.value) return;
  const name = editSpeaker.value.name;
  if (!editReplaceFile.value || !editReplaceTranscript.value.trim()) {
    log("Replace audio: pick a file and supply a transcript first", "warn");
    return;
  }
  editSaving.value = true;
  log(`Replacing reference audio for "${name}"...`, "info");
  try {
    const res = await client.value.tts.replaceSpeakerAudio(
      name,
      editReplaceFile.value,
      editReplaceTranscript.value.trim(),
    );
    log(`replaceSpeakerAudio: ${res.message}`, res.success ? "ok" : "warn");
    await refreshSpeakers({ silent: true });
    if (res.success) {
      editReplaceFile.value = null;
      editReplaceTranscript.value = "";
    }
  } catch (err) {
    logError(err);
  } finally {
    editSaving.value = false;
  }
}

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

// ── Timed synthesize (offline) + highlight ────────────────────────────────────
async function synthesizeTimed() {
  if (!text.value.trim()) { log("Please enter text", "warn"); return; }
  clear();
  loading.value = true;
  activeIdx.value = -1;
  log("Timed synthesizing (with marks)...", "info");
  try {
    const res = await client.value!.tts.synthesizeTimed(text.value, buildOpts());
    audioSrc.value = bufferToObjectUrl(base64ToArrayBuffer(res.audioBase64), res.format);
    readText.value = text.value;
    marks.value = res.marks;
    log(`Timed synthesis complete: duration=${res.durationMs}ms, ${res.marks.length} marks`, "ok");
    await nextTick();
    audioEl.value?.play().catch(() => {});
  } catch (err) {
    logError(err);
  } finally {
    loading.value = false;
  }
}

/** Index of the last mark whose start_ms <= t(ms). Stays on a chunk until the
 * next one starts (no gap flicker). Returns -1 before the first mark. */
function activeMarkIndex(list: TimestampMark[], t: number): number {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start_ms <= t) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

function onTimeUpdate() {
  const el = audioEl.value;
  if (!el || !marks.value.length) return;
  const idx = activeMarkIndex(marks.value, el.currentTime * 1000);
  if (idx !== activeIdx.value) activeIdx.value = idx;
}

// Renderable segments: plain gaps + highlightable chunks, built from readText+marks.
const segments = computed(() => {
  const out: Array<{ text: string; markIndex: number | null; key: string }> = [];
  let cursor = 0;
  marks.value.forEach((m, i) => {
    if (m.char_start > cursor) {
      out.push({ text: readText.value.slice(cursor, m.char_start), markIndex: null, key: `gap-${i}` });
    }
    out.push({ text: readText.value.slice(m.char_start, m.char_end), markIndex: m.index, key: `mark-${i}` });
    cursor = Math.max(cursor, m.char_end);
  });
  if (cursor < readText.value.length) {
    out.push({ text: readText.value.slice(cursor), markIndex: null, key: "tail" });
  }
  return out;
});

// ── Timed stream (play-while-streaming + highlight) ───────────────────────────
// Reuses the SAME <audio> + @timeupdate + segments highlight as offline: marks
// accumulate into `marks` as they arrive, and playback advances the shared
// <audio> currentTime which onTimeUpdate maps to the active chunk.

type StreamEvents = AsyncGenerator<TimedStreamEvent>;

/** Append a streamed mark event to the reactive `marks` list. Stream marks
 * carry no end_ms (highlight only needs start_ms), so we fill it with start_ms. */
function pushStreamMark(ev: { index: number; text: string; char_start: number; char_end: number; start_ms: number }) {
  marks.value = [...marks.value, {
    index: ev.index, text: ev.text,
    char_start: ev.char_start, char_end: ev.char_end,
    start_ms: ev.start_ms, end_ms: ev.start_ms,
  }];
}

/** True play-while-streaming for MSE-capable formats (mp3/aac). */
async function timedStreamMse(events: StreamEvents, mime: string) {
  const ms = new MediaSource();
  audioSrc.value = URL.createObjectURL(ms);
  await nextTick();

  const sb: SourceBuffer = await new Promise((resolve, reject) => {
    ms.addEventListener("sourceopen", () => {
      try { resolve(ms.addSourceBuffer(mime)); } catch (e) { reject(e); }
    }, { once: true });
  });

  const queue: ArrayBuffer[] = [];
  let started = false, ended = false, frames = 0, markCount = 0;
  const pump = () => {
    if (sb.updating || queue.length === 0) return;
    sb.appendBuffer(queue.shift()!);
  };
  sb.addEventListener("updateend", () => {
    if (!started) { started = true; audioEl.value?.play().catch(() => {}); }
    pump();
    if (ended && queue.length === 0 && !sb.updating) {
      try { ms.endOfStream(); } catch { /* ignore */ }
    }
  });

  for await (const ev of events) {
    if (ev.type === "mark") { markCount++; pushStreamMark(ev); }
    else if (ev.type === "audio") { frames++; queue.push(base64ToArrayBuffer(ev.audio_base64)); pump(); }
    else { log(`done: duration=${ev.duration_ms}ms (${markCount} marks, ${frames} frames)`, "ok"); }
  }
  ended = true;
  while (queue.length > 0 || sb.updating) { await new Promise((r) => setTimeout(r, 30)); pump(); }
  try { ms.endOfStream(); } catch { /* ignore */ }
}

/** Buffered fallback for non-MSE formats (pcm/wav/…): collect frames + marks,
 * assemble, then play. Highlight still works via the shared <audio>. */
async function timedStreamBuffered(events: StreamEvents, fmt: typeof format.value) {
  const chunks: Uint8Array[] = [];
  let frames = 0, markCount = 0;
  for await (const ev of events) {
    if (ev.type === "mark") { markCount++; pushStreamMark(ev); }
    else if (ev.type === "audio") { frames++; chunks.push(new Uint8Array(base64ToArrayBuffer(ev.audio_base64))); }
    else { log(`done: duration=${ev.duration_ms}ms (${markCount} marks, ${frames} frames)`, "ok"); }
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
  // Raw PCM needs a WAV container to play in <audio>; other formats pass through.
  const buf = fmt === "pcm" ? pcmToWav(merged.buffer, 24000) : merged.buffer;
  audioSrc.value = bufferToObjectUrl(buf, fmt === "pcm" ? "wav" : fmt);
  await nextTick();
  audioEl.value?.play().catch(() => {});
}

async function synthesizeStreamTimed() {
  if (!text.value.trim()) { log("Please enter text", "warn"); return; }
  clear();
  loading.value = true;
  activeIdx.value = -1;
  marks.value = [];
  readText.value = text.value;
  log("Timed streaming (highlight)...", "info");
  try {
    const fmt = format.value;
    const mime = pickMseMime(fmt);
    const events = await client.value!.tts.synthesizeStreamTimed(text.value, buildOpts());
    if (mime) { log(`MSE streaming as ${mime}`, "info"); await timedStreamMse(events, mime); }
    else { await timedStreamBuffered(events, fmt); }
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
        <button
          v-for="s in speakers"
          :key="s.name"
          type="button"
          class="speaker-chip"
          :class="{ playing: playingSpeaker === s.name }"
          :title="s.description ?? ''"
          :disabled="speakerAudioLoading === s.name"
          @click="playSpeakerAudio(s.name)"
        >
          <span class="speaker-chip-icon">{{
            speakerAudioLoading === s.name ? '…' :
            playingSpeaker === s.name ? '⏸' : '▶'
          }}</span>
          {{ speakerLabel(s) }}
        </button>
      </div>
      <small v-if="speakers.length" style="color: #888; font-size: 0.85em; display: block; margin-top: 6px">
        Click a chip to test <code>getSpeakerAudio()</code>.
      </small>
      <div v-else-if="!speakersLoading" style="color: #888; font-size: 0.9em; margin-top: 8px">
        No speakers compatible with the selected provider.
      </div>
    </div>

    <!-- Edit speaker (SDK 0.5.0+) -->
    <div class="card">
      <h3>Edit Speaker <small style="font-weight: normal; color: #888">— exercise updateSpeaker / renameSpeaker / replaceSpeakerAudio</small></h3>

      <div class="row">
        <div class="field">
          <label>Target speaker</label>
          <select v-model="editTarget" :disabled="!speakers.length">
            <option v-if="!speakers.length" value="">(no speakers)</option>
            <option v-for="s in speakers" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
        </div>
      </div>

      <template v-if="editSpeaker">
        <div class="row">
          <div class="field" style="flex: 1 1 100%">
            <label>description</label>
            <input v-model="editDesc" type="text" placeholder="Optional description" />
          </div>
        </div>

        <div class="row">
          <div class="field"><label>gender</label><input v-model="editGender" type="text" /></div>
          <div class="field"><label>language</label><input v-model="editLanguage" type="text" /></div>
          <div class="field"><label>accent</label><input v-model="editAccent" type="text" /></div>
          <div class="field"><label>tone</label><input v-model="editTone" type="text" /></div>
          <div class="field"><label>duration_s</label><input v-model="editDuration" type="number" step="0.1" min="0" /></div>
          <div class="field" style="flex: 1 1 240px">
            <label>expression_tags (csv)</label>
            <input v-model="editTags" type="text" placeholder="excitedly, amazed" />
          </div>
        </div>

        <div v-if="providerList.length" class="field" style="margin-bottom: 8px">
          <label>compatible_models</label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px">
            <label v-for="m in providerList" :key="m.name" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.9em">
              <input
                type="checkbox"
                :checked="editCompat.has(m.name)"
                @change="toggleEditCompat(m.name)"
              />
              <code>{{ m.name }}</code>
            </label>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-primary" :disabled="editSaving" @click="saveSpeakerEdits">
            Save description / metadata / compatible_models
          </button>
        </div>

        <div class="row">
          <div class="field" style="flex: 1 1 280px">
            <label>rename to</label>
            <input v-model="editRenameTo" type="text" :placeholder="editSpeaker.name" />
          </div>
          <div class="field" style="justify-content: flex-end">
            <label>&nbsp;</label>
            <button class="btn btn-outline" :disabled="editSaving" @click="renameSelectedSpeaker">
              Rename speaker
            </button>
          </div>
        </div>

        <div class="row">
          <div class="field" style="flex: 1 1 280px">
            <label>replacement audio file</label>
            <input type="file" accept="audio/*" @change="handleReplaceFile" />
          </div>
          <div class="field" style="flex: 1 1 280px">
            <label>transcript</label>
            <input v-model="editReplaceTranscript" type="text" placeholder="Exact text spoken in the file" />
          </div>
          <div class="field" style="justify-content: flex-end">
            <label>&nbsp;</label>
            <button class="btn btn-outline" :disabled="editSaving" @click="replaceSelectedAudio">
              Replace reference audio
            </button>
          </div>
        </div>
      </template>
      <div v-else style="color: #888; font-size: 0.9em">
        Fetch speakers above to enable editing.
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
        <button class="btn btn-outline" :disabled="loading" @click="synthesizeTimed">Timed Synthesize (highlight)</button>
        <button class="btn btn-outline" :disabled="loading" @click="synthesizeStreamTimed">Timed Stream (highlight)</button>
      </div>

      <audio
        v-if="audioSrc"
        ref="audioEl"
        :src="audioSrc"
        controls
        class="audio-player"
        @timeupdate="onTimeUpdate"
        @ended="activeIdx = -1"
      />

      <!-- Read-along transcript: current chunk highlights as the audio plays -->
      <p v-if="segments.length" class="reader-transcript">
        <template v-for="seg in segments" :key="seg.key">
          <span
            v-if="seg.markIndex !== null"
            :class="{ 'reader-active': seg.markIndex === activeIdx }"
          >{{ seg.text }}</span>
          <span v-else>{{ seg.text }}</span>
        </template>
      </p>

      <LogBox :entries="entries" />
    </div>
  </div>
</template>

<style scoped>
.reader-transcript {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 1.05rem;
  line-height: 1.9;
  white-space: pre-wrap;
}
.reader-transcript .reader-active {
  background: #fde68a;
  border-radius: 3px;
  transition: background-color 0.15s ease;
}
</style>

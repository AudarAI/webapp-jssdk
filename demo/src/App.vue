<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "./composables/useClient";
import ConnectPanel from "./components/ConnectPanel.vue";
import TtsPanel from "./components/TtsPanel.vue";
import SttPanel from "./components/SttPanel.vue";
import TranslationPanel from "./components/TranslationPanel.vue";
import AgentPanel from "./components/AgentPanel.vue";
import KnowledgePanel from "./components/KnowledgePanel.vue";
import ToolPanel from "./components/ToolPanel.vue";
import SkillPanel from "./components/SkillPanel.vue";
import ArchetypePanel from "./components/ArchetypePanel.vue";
import RoomPanel from "./components/RoomPanel.vue";

const { connected } = useClient();

type Panel = "tts" | "stt" | "translation" | "agent" | "knowledge" | "tool" | "skill" | "archetype" | "room";
const activePanel = ref<Panel>("tts");

const NAV: { key: Panel; label: string }[] = [
  { key: "tts",         label: "🔊 Text-to-Speech"   },
  { key: "stt",         label: "🎙️ Speech-to-Text"   },
  { key: "translation", label: "🌐 Voice Translation" },
  { key: "agent",       label: "🤖 Voice Agent"       },
  { key: "knowledge",   label: "📚 Knowledge Base"    },
  { key: "tool",        label: "🔧 Tools"             },
  { key: "skill",       label: "⚡ Skills"             },
  { key: "archetype",   label: "🧩 Archetypes"        },
  { key: "room",        label: "🏠 Rooms & Sessions"  },
];

const PANEL_TITLES: Record<Panel, string> = {
  tts:         "🔊 TTS — Text-to-Speech",
  stt:         "🎙️ STT — Speech-to-Text",
  translation: "🌐 Translation — Voice Translation",
  agent:       "🤖 Agent — Voice Agent",
  knowledge:   "📚 Knowledge — Knowledge Base",
  tool:        "🔧 Tools",
  skill:       "⚡ Skills",
  archetype:   "🧩 Archetypes",
  room:        "🏠 Rooms & Sessions",
};
</script>

<template>
  <header>
    <span class="logo">AudarAI JS SDK</span>
    <span class="subtitle">Interactive Test Panel</span>
    <span class="badge" :class="connected ? 'badge-ok' : 'badge-idle'">
      {{ connected ? "✓ Connected" : "Not Connected" }}
    </span>
  </header>

  <div class="layout">
    <!-- ── Sidebar ── -->
    <aside class="sidebar">
      <ConnectPanel />

      <nav class="nav">
        <button
          v-for="item in NAV"
          :key="item.key"
          class="nav-item"
          :class="{ active: activePanel === item.key }"
          @click="activePanel = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="sidebar-version">v0.0.1</div>
    </aside>

    <!-- ── Main ── -->
    <main class="main">
      <template v-if="!connected">
        <div class="empty-state">
          <p>Please configure and click Connect on the left panel first</p>
        </div>
      </template>

      <template v-else>
        <h2>{{ PANEL_TITLES[activePanel] }}</h2>

        <!-- v-show preserves DOM state so recordings/logs aren't reset on tab switch -->
        <TtsPanel         v-show="activePanel === 'tts'" />
        <SttPanel         v-show="activePanel === 'stt'" />
        <TranslationPanel v-show="activePanel === 'translation'" />
        <AgentPanel       v-show="activePanel === 'agent'" />
        <KnowledgePanel   v-show="activePanel === 'knowledge'" />
        <ToolPanel        v-show="activePanel === 'tool'" />
        <SkillPanel       v-show="activePanel === 'skill'" />
        <ArchetypePanel   v-show="activePanel === 'archetype'" />
        <RoomPanel        v-show="activePanel === 'room'" />
      </template>
    </main>
  </div>
</template>

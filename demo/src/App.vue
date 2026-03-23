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
import RoomPanel from "./components/RoomPanel.vue";

const { connected } = useClient();

type Panel = "tts" | "stt" | "translation" | "agent" | "knowledge" | "tool" | "skill" | "room";
const activePanel = ref<Panel>("tts");

const NAV: { key: Panel; label: string }[] = [
  { key: "tts",         label: "🔊 TTS 语音合成"  },
  { key: "stt",         label: "🎙️ STT 语音转写"  },
  { key: "translation", label: "🌐 语音翻译"       },
  { key: "agent",       label: "🤖 Agent 对话"     },
  { key: "knowledge",   label: "📚 知识库"          },
  { key: "tool",        label: "🔧 工具管理"        },
  { key: "skill",       label: "⚡ 技能管理"        },
  { key: "room",        label: "🏠 Room & Session"  },
];

const PANEL_TITLES: Record<Panel, string> = {
  tts:         "🔊 TTS — 文字转语音",
  stt:         "🎙️ STT — 语音转文字",
  translation: "🌐 Translation — 语音翻译",
  agent:       "🤖 Agent — 智能对话",
  knowledge:   "📚 Knowledge — 知识库管理",
  tool:        "🔧 Tools — 工具管理",
  skill:       "⚡ Skill — 技能管理",
  room:        "🏠 Room & Session — 房间与会话管理",
};
</script>

<template>
  <header>
    <span class="logo">AiVox JS SDK</span>
    <span class="subtitle">交互测试面板</span>
    <span class="badge" :class="connected ? 'badge-ok' : 'badge-idle'">
      {{ connected ? "✓ 已连接" : "未连接" }}
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
    </aside>

    <!-- ── Main ── -->
    <main class="main">
      <template v-if="!connected">
        <div class="empty-state">
          <p>请先在左侧填写配置并点击「连接」</p>
        </div>
      </template>

      <template v-else>
        <h2>{{ PANEL_TITLES[activePanel] }}</h2>

        <!-- v-show 保留 DOM 状态，切换面板时不重置录音/日志 -->
        <TtsPanel         v-show="activePanel === 'tts'" />
        <SttPanel         v-show="activePanel === 'stt'" />
        <TranslationPanel v-show="activePanel === 'translation'" />
        <AgentPanel       v-show="activePanel === 'agent'" />
        <KnowledgePanel   v-show="activePanel === 'knowledge'" />
        <ToolPanel        v-show="activePanel === 'tool'" />
        <SkillPanel       v-show="activePanel === 'skill'" />
        <RoomPanel        v-show="activePanel === 'room'" />
      </template>
    </main>
  </div>
</template>

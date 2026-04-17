<script setup lang="ts">
import { ref, watch } from "vue";
import type { LogEntry } from "../composables/useLog";

const props = defineProps<{ entries: LogEntry[] }>();

const boxRef = ref<HTMLDivElement>();

watch(
  () => props.entries.length,
  () => {
    const el = boxRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  }
);
</script>

<template>
  <div ref="boxRef" class="log-box">
    <template v-if="entries.length === 0">
      <span class="placeholder">Waiting for actions...</span>
    </template>
    <div v-for="e in entries" :key="e.id" :class="['log-line', e.level]">
      <span class="log-time">[{{ e.time }}]</span> {{ e.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const model = defineModel<File | null>({ default: null });

const isDragging = ref(false);
const inputRef = ref<HTMLInputElement>();

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null;
  model.value = file;
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0] ?? null;
  if (file) {
    model.value = file;
    if (inputRef.value) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.value.files = dt.files;
    }
  }
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ dragging: isDragging, 'has-file': !!model }"
    @click="inputRef?.click()"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="inputRef" type="file" accept="audio/*" @change="onFileChange" />
    <span v-if="model">{{ model.name }}</span>
    <span v-else>点击或拖拽音频文件</span>
  </div>
</template>

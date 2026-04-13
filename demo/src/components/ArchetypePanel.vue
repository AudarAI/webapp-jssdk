<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { ArchetypeResponse } from "@audarai/sdk";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Archetype 列表 ─────────────────────────────────────────────────────
const archetypes = ref<ArchetypeResponse[]>([]);

async function listArchetypes() {
  log("获取 Archetype 列表...", "info");
  try {
    archetypes.value = await client.value!.archetype.list();
    log(`共 ${archetypes.value.length} 个 Archetype`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function deleteArchetype(id: string) {
  log(`删除 Archetype: ${id}...`, "info");
  try {
    await client.value!.archetype.delete(id);
    archetypes.value = archetypes.value.filter(a => a.id !== id);
    log("删除成功", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── 编辑 Archetype ─────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editForm = ref({ name: "", description: "", base_prompt: "" });

function startEdit(a: ArchetypeResponse) {
  editingId.value = a.id;
  editForm.value = { name: a.name, description: a.description, base_prompt: a.base_prompt };
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  log(`更新 Archetype: ${editingId.value}...`, "info");
  try {
    const updated = await client.value!.archetype.update(editingId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
      base_prompt: editForm.value.base_prompt || undefined,
    });
    const idx = archetypes.value.findIndex(a => a.id === updated.id);
    if (idx >= 0) archetypes.value[idx] = updated;
    log(`Archetype 更新成功: ${updated.id}`, "ok");
    editingId.value = null;
  } catch (err) {
    logError(err);
  }
}

// ── Card 2: 创建 Archetype ─────────────────────────────────────────────────────
const newArchetype = ref({ name: "", description: "", base_prompt: "" });

async function createArchetype() {
  if (!newArchetype.value.name.trim()) { log("请填写 Archetype 名称", "warn"); return; }

  log(`创建 Archetype: ${newArchetype.value.name}...`, "info");
  try {
    const created = await client.value!.archetype.create({
      name: newArchetype.value.name,
      description: newArchetype.value.description || undefined,
      base_prompt: newArchetype.value.base_prompt || undefined,
    });
    archetypes.value.push(created);
    log(`Archetype 创建成功: ${created.id}`, "ok");
    newArchetype.value = { name: "", description: "", base_prompt: "" };
  } catch (err) {
    logError(err);
  }
}
</script>

<template>
  <div>
    <!-- Card 1: Archetype 列表 -->
    <div class="card">
      <h3>Archetype 列表</h3>
      <div class="btn-row">
        <button class="btn btn-outline" @click="listArchetypes">刷新列表</button>
      </div>

      <table v-if="archetypes.length" class="archetype-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>描述</th>
            <th>Base Prompt</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in archetypes" :key="a.id">
            <td class="id-cell" :title="a.id">{{ a.id.slice(0, 8) }}…</td>
            <td>{{ a.name }}</td>
            <td class="desc-cell" :title="a.description">{{ a.description || "—" }}</td>
            <td class="prompt-cell" :title="a.base_prompt">{{ a.base_prompt || "—" }}</td>
            <td>{{ new Date(a.created_at).toLocaleString() }}</td>
            <td class="action-cell">
              <button class="btn btn-sm btn-outline" @click="startEdit(a)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteArchetype(a.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-hint">暂无 Archetype，点击「刷新列表」加载。</p>

      <!-- 编辑表单 -->
      <div v-if="editingId" class="sub-section">
        <h4>编辑 Archetype <span class="editing-id">{{ editingId.slice(0, 8) }}…</span></h4>
        <div class="row">
          <div class="field">
            <label>名称</label>
            <input v-model="editForm.name" type="text" />
          </div>
          <div class="field">
            <label>描述</label>
            <input v-model="editForm.description" type="text" />
          </div>
        </div>
        <div class="field">
          <label>Base Prompt</label>
          <textarea v-model="editForm.base_prompt" rows="6" />
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveEdit">保存</button>
          <button class="btn btn-outline" @click="cancelEdit">取消</button>
        </div>
      </div>

      <LogBox :entries="entries" />
    </div>

    <!-- Card 2: 创建 Archetype -->
    <div class="card">
      <h3>创建 Archetype</h3>

      <div class="row">
        <div class="field">
          <label>名称 *</label>
          <input v-model="newArchetype.name" type="text" placeholder="My Archetype" />
        </div>
        <div class="field">
          <label>描述（可选）</label>
          <input v-model="newArchetype.description" type="text" placeholder="原型用途说明" />
        </div>
      </div>

      <div class="field">
        <label>Base Prompt（注入 Agent 的基础系统提示词）</label>
        <textarea v-model="newArchetype.base_prompt" rows="6" placeholder="你是一个专业的客服助手..." />
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" @click="createArchetype">创建 Archetype</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.archetype-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.archetype-table th,
.archetype-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.archetype-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}
.desc-cell,
.prompt-cell {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-cell {
  white-space: nowrap;
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
.empty-hint {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
  margin: 0.5rem 0;
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
.editing-id {
  font-family: monospace;
  font-size: 0.78rem;
  color: #9ca3af;
  margin-left: 0.4rem;
}
</style>

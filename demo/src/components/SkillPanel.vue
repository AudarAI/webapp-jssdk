<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { SkillResponse } from "@audarai/sdk";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Skill List ─────────────────────────────────────────────────────────
const skills = ref<SkillResponse[]>([]);

async function listSkills() {
  log("Fetching skill list...", "info");
  try {
    skills.value = await client.value!.skill.list();
    log(`Found ${skills.value.length} skills`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function deleteSkill(id: string) {
  log(`Deleting Skill: ${id}...`, "info");
  try {
    await client.value!.skill.delete(id);
    skills.value = skills.value.filter(s => s.id !== id);
    log("Deleted successfully", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Edit Skill ─────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editForm = ref({ name: "", description: "", content: "", is_public: false });

function startEdit(s: SkillResponse) {
  editingId.value = s.id;
  editForm.value = { name: s.name, description: s.description, content: s.content, is_public: s.is_public };
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  log(`Updating Skill: ${editingId.value}...`, "info");
  try {
    const updated = await client.value!.skill.update(editingId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
      content: editForm.value.content || undefined,
      is_public: editForm.value.is_public,
    });
    const idx = skills.value.findIndex(s => s.id === updated.id);
    if (idx >= 0) skills.value[idx] = updated;
    log(`Updated successfully: ${updated.id}`, "ok");
    editingId.value = null;
  } catch (err) {
    logError(err);
  }
}

// ── Card 2: Create Skill ─────────────────────────────────────────────────────────
const newSkill = ref({ name: "", description: "", content: "" });
const isPublic = ref(false);

async function createSkill() {
  if (!newSkill.value.name.trim()) { log("Please enter skill name", "warn"); return; }

  log(`Creating Skill: ${newSkill.value.name}...`, "info");
  try {
    const created = await client.value!.skill.create({
      name: newSkill.value.name,
      description: newSkill.value.description || undefined,
      content: newSkill.value.content || undefined,
      is_public: isPublic.value,
    });
    skills.value.push(created);
    log(`Created successfully: ${created.id}`, "ok");
    newSkill.value = { name: "", description: "", content: "" };
    isPublic.value = false;
  } catch (err) {
    logError(err);
  }
}
</script>

<template>
  <div>
    <!-- Card 1: Skill List -->
    <div class="card">
      <h3>Skill List</h3>
      <div class="btn-row">
        <button class="btn btn-outline" @click="listSkills">Refresh</button>
      </div>

      <table v-if="skills.length" class="skill-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Description</th>
            <th>Public</th>
            <th>Status</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in skills" :key="s.id">
            <td class="id-cell" :title="s.id">{{ s.id.slice(0, 8) }}…</td>
            <td>{{ s.name }}</td>
            <td class="desc-cell" :title="s.description">{{ s.description || "—" }}</td>
            <td>{{ s.is_public ? "Yes" : "No" }}</td>
            <td>{{ s.status }}</td>
            <td>{{ new Date(s.created_at).toLocaleString() }}</td>
            <td class="action-cell">
              <button class="btn btn-sm btn-outline" @click="startEdit(s)">Edit</button>
              <button class="btn btn-sm btn-danger" @click="deleteSkill(s.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-hint">No skills yet. Click Refresh to load.</p>

      <!-- Edit form -->
      <div v-if="editingId" class="sub-section">
        <h4>Edit Skill <span class="editing-id">{{ editingId.slice(0, 8) }}…</span></h4>
        <div class="row">
          <div class="field">
            <label>Name</label>
            <input v-model="editForm.name" type="text" />
          </div>
          <div class="field">
            <label>Description</label>
            <input v-model="editForm.description" type="text" />
          </div>
        </div>
        <div class="field">
          <label>Content</label>
          <textarea v-model="editForm.content" rows="6" />
        </div>
        <div class="field checkbox-field">
          <label>
            <input v-model="editForm.is_public" type="checkbox" />
            Public (is_public)
          </label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveEdit">Save</button>
          <button class="btn btn-outline" @click="cancelEdit">Cancel</button>
        </div>
      </div>

      <LogBox :entries="entries" />
    </div>

    <!-- Card 2: Create Skill -->
    <div class="card">
      <h3>Create Skill</h3>

      <div class="row">
        <div class="field">
          <label>Name *</label>
          <input v-model="newSkill.name" type="text" placeholder="My Skill" />
        </div>
        <div class="field">
          <label>Description (optional)</label>
          <input v-model="newSkill.description" type="text" placeholder="Describe the skill purpose" />
        </div>
      </div>

      <div class="field">
        <label>Content (Markdown injected into agent system prompt)</label>
        <textarea v-model="newSkill.content" rows="6" placeholder="## Skill Description&#10;&#10;Describe behavior rules..." />
      </div>

      <div class="field checkbox-field">
        <label>
          <input v-model="isPublic" type="checkbox" />
          Public (is_public)
        </label>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" @click="createSkill">Create Skill</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.skill-table th,
.skill-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.skill-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}
.desc-cell {
  max-width: 200px;
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
.checkbox-field label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.checkbox-field input[type="checkbox"] {
  width: auto;
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

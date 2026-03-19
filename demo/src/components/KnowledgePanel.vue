<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type {
  KnowledgeResponse,
  KnowledgeDocumentResponse,
  SearchResultItem,
} from "@aivox/sdk";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Knowledge CRUD ─────────────────────────────────────────────────────
const knowledgeBases = ref<KnowledgeResponse[]>([]);
const selectedId = ref("");

const newKnowledge = ref({ name: "", description: "", source_uri: "", collection: "" });

async function listKnowledge() {
  log("获取知识库列表...", "info");
  try {
    knowledgeBases.value = await client.value!.knowledge.list();
    log(`共 ${knowledgeBases.value.length} 个知识库`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function createKnowledge() {
  if (!newKnowledge.value.name.trim()) { log("请填写知识库名称", "warn"); return; }
  log(`创建知识库: ${newKnowledge.value.name}...`, "info");
  try {
    const created = await client.value!.knowledge.create({
      name: newKnowledge.value.name,
      description: newKnowledge.value.description || undefined,
      source_uri: newKnowledge.value.source_uri || undefined,
      collection: newKnowledge.value.collection || undefined,
    });
    knowledgeBases.value.push(created);
    selectedId.value = created.id;
    ingestKbId.value = created.id;
    docsKbId.value = created.id;
    searchKbId.value = created.id;
    log(`知识库创建成功: ${created.id}`, "ok");
    newKnowledge.value = { name: "", description: "", source_uri: "", collection: "" };
  } catch (err) {
    logError(err);
  }
}

async function deleteKnowledge(id: string) {
  log(`删除知识库: ${id}...`, "info");
  try {
    await client.value!.knowledge.delete(id);
    knowledgeBases.value = knowledgeBases.value.filter(k => k.id !== id);
    if (selectedId.value === id) selectedId.value = "";
    log("删除成功", "ok");
  } catch (err) {
    logError(err);
  }
}

async function refreshKnowledge(id: string) {
  log(`刷新知识库状态: ${id}...`, "info");
  try {
    const updated = await client.value!.knowledge.get(id);
    const idx = knowledgeBases.value.findIndex(k => k.id === id);
    if (idx >= 0) knowledgeBases.value[idx] = updated;
    log(`embedding_status: ${updated.embedding_status}`, "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 2: 数据导入 ────────────────────────────────────────────────────────────
const ingestKbId = ref("");
const ingestType = ref<"text" | "url" | "file">("text");
const ingestText = ref("");
const ingestUrl = ref("");
const ingestLabel = ref("");
const ingestLang = ref("");
const ingestFile = ref<File | null>(null);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  ingestFile.value = input.files?.[0] ?? null;
}

async function doIngest() {
  if (!ingestKbId.value) { log("请选择知识库", "warn"); return; }

  if (ingestType.value === "file") {
    if (!ingestFile.value) { log("请选择文件", "warn"); return; }
    log(`上传文件: ${ingestFile.value.name}...`, "info");
    try {
      await client.value!.knowledge.ingestFile(ingestKbId.value, ingestFile.value);
      log("文件上传成功 (异步处理中)", "ok");
      ingestFile.value = null;
    } catch (err) {
      logError(err);
    }
    return;
  }

  if (ingestType.value === "text" && !ingestText.value.trim()) {
    log("请输入文本内容", "warn"); return;
  }
  if (ingestType.value === "url" && !ingestUrl.value.trim()) {
    log("请输入 URL", "warn"); return;
  }

  log(`导入 ${ingestType.value}...`, "info");
  try {
    await client.value!.knowledge.ingest(ingestKbId.value, {
      source_type: ingestType.value,
      text: ingestType.value === "text" ? ingestText.value : undefined,
      url: ingestType.value === "url" ? ingestUrl.value : undefined,
      source_label: ingestLabel.value || undefined,
      language: ingestLang.value || undefined,
    });
    log("导入成功 (异步处理中，请轮询 embedding_status)", "ok");
  } catch (err) {
    logError(err);
  }
}

async function doReingest() {
  if (!ingestKbId.value) { log("请选择知识库", "warn"); return; }
  log("重新导入...", "info");
  try {
    await client.value!.knowledge.reingest(ingestKbId.value);
    log("重新导入已触发 (异步处理中)", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 3: 文档块管理 ──────────────────────────────────────────────────────────
const docsKbId = ref("");
const documents = ref<KnowledgeDocumentResponse[]>([]);

async function listDocuments() {
  if (!docsKbId.value) { log("请选择知识库", "warn"); return; }
  log("加载文档块...", "info");
  try {
    documents.value = await client.value!.knowledge.listDocuments(docsKbId.value);
    log(`共 ${documents.value.length} 个文档块`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function deleteDocument(docId: string) {
  if (!docsKbId.value) return;
  log(`删除文档块: ${docId}...`, "info");
  try {
    await client.value!.knowledge.deleteDocument(docsKbId.value, docId);
    documents.value = documents.value.filter(d => d.id !== docId);
    log("删除成功", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 4: 语义搜索 ────────────────────────────────────────────────────────────
const searchKbId = ref("");
const searchQuery = ref("");
const searchTopK = ref(5);
const searchLang = ref("");
const searchResults = ref<SearchResultItem[]>([]);

async function doSearch() {
  if (!searchKbId.value) { log("请选择知识库", "warn"); return; }
  if (!searchQuery.value.trim()) { log("请输入搜索词", "warn"); return; }
  log(`搜索: "${searchQuery.value}"...`, "info");
  try {
    searchResults.value = await client.value!.knowledge.search(searchKbId.value, {
      query: searchQuery.value,
      top_k: searchTopK.value,
      language: searchLang.value || undefined,
    });
    log(`返回 ${searchResults.value.length} 条结果`, "ok");
  } catch (err) {
    logError(err);
  }
}

const STATUS_COLOR: Record<string, string> = {
  pending: "color:#d97706",
  processing: "color:#2563eb",
  completed: "color:#16a34a",
  failed: "color:#dc2626",
};
</script>

<template>
  <div>
    <!-- Card 1: 知识库管理 -->
    <div class="card">
      <h3>知识库管理</h3>
      <div class="btn-row">
        <button class="btn btn-outline" @click="listKnowledge">获取列表</button>
      </div>

      <table v-if="knowledgeBases.length" class="kb-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>Collection</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="kb in knowledgeBases" :key="kb.id">
            <td class="id-cell" :title="kb.id">{{ kb.id.slice(0, 8) }}…</td>
            <td>{{ kb.name }}</td>
            <td>{{ kb.collection || "—" }}</td>
            <td>
              <span :style="STATUS_COLOR[kb.embedding_status] ?? ''">
                {{ kb.embedding_status }}
              </span>
            </td>
            <td>{{ new Date(kb.updated_at).toLocaleString() }}</td>
            <td class="action-cell">
              <button class="btn btn-sm btn-outline" @click="refreshKnowledge(kb.id)">刷新</button>
              <button class="btn btn-sm btn-danger" @click="deleteKnowledge(kb.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="sub-section">
        <h4>创建知识库</h4>
        <div class="row">
          <div class="field">
            <label>名称 *</label>
            <input v-model="newKnowledge.name" type="text" placeholder="My Knowledge" />
          </div>
          <div class="field">
            <label>collection</label>
            <input v-model="newKnowledge.collection" type="text" placeholder="可选" />
          </div>
        </div>
        <div class="field">
          <label>description</label>
          <input v-model="newKnowledge.description" type="text" placeholder="可选描述" />
        </div>
        <div class="field">
          <label>source_uri（URL 源，用于 reingest）</label>
          <input v-model="newKnowledge.source_uri" type="text" placeholder="https://..." />
        </div>
        <button class="btn btn-primary" @click="createKnowledge">创建知识库</button>
      </div>
    </div>

    <!-- Card 2: 数据导入 -->
    <div class="card">
      <h3>数据导入</h3>
      <div class="row">
        <div class="field">
          <label>选择知识库</label>
          <select v-model="ingestKbId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>导入类型</label>
          <select v-model="ingestType">
            <option value="text">文本</option>
            <option value="url">URL</option>
            <option value="file">文件</option>
          </select>
        </div>
      </div>

      <template v-if="ingestType === 'text'">
        <div class="field">
          <label>文本内容</label>
          <textarea v-model="ingestText" rows="4" placeholder="在此粘贴要导入的文本内容…" />
        </div>
      </template>

      <template v-else-if="ingestType === 'url'">
        <div class="field">
          <label>URL</label>
          <input v-model="ingestUrl" type="text" placeholder="https://example.com/doc" />
        </div>
      </template>

      <template v-else>
        <div class="field">
          <label>文件（txt / md / pdf / docx）</label>
          <input type="file" accept=".txt,.md,.pdf,.docx" @change="onFileChange" />
          <span v-if="ingestFile" class="file-hint">{{ ingestFile.name }}</span>
        </div>
      </template>

      <div v-if="ingestType !== 'file'" class="row">
        <div class="field">
          <label>source_label（可选）</label>
          <input v-model="ingestLabel" type="text" placeholder="文档来源标签" />
        </div>
        <div class="field">
          <label>language（可选）</label>
          <input v-model="ingestLang" type="text" placeholder="zh-CN" />
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" @click="doIngest">
          {{ ingestType === "file" ? "上传文件" : "导入" }}
        </button>
        <button class="btn btn-outline" @click="doReingest" title="重新从 source_uri 导入（URL 源）">
          重新导入 (reingest)
        </button>
      </div>

      <LogBox :entries="entries" />
    </div>

    <!-- Card 3: 文档块管理 -->
    <div class="card">
      <h3>文档块管理</h3>
      <div class="row">
        <div class="field">
          <label>选择知识库</label>
          <select v-model="docsKbId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn btn-outline" @click="listDocuments">加载文档块</button>
        </div>
      </div>

      <table v-if="documents.length" class="kb-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>#</th>
            <th>来源</th>
            <th>内容摘要</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in documents" :key="doc.id">
            <td class="id-cell" :title="doc.id">{{ doc.id.slice(0, 8) }}…</td>
            <td>{{ doc.chunk_index }}</td>
            <td>{{ doc.source_label }}</td>
            <td class="content-cell">{{ doc.content.slice(0, 80) }}{{ doc.content.length > 80 ? "…" : "" }}</td>
            <td>
              <button class="btn btn-sm btn-danger" @click="deleteDocument(doc.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="docsKbId" class="empty-hint">暂无文档块，请先导入数据。</p>
    </div>

    <!-- Card 4: 语义搜索 -->
    <div class="card">
      <h3>语义搜索</h3>
      <div class="row">
        <div class="field">
          <label>选择知识库</label>
          <select v-model="searchKbId">
            <option value="">— 请先获取列表 —</option>
            <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>top_k</label>
          <input v-model.number="searchTopK" type="number" min="1" max="20" style="width:5rem" />
        </div>
        <div class="field">
          <label>language（可选）</label>
          <input v-model="searchLang" type="text" placeholder="zh-CN" />
        </div>
      </div>
      <div class="field">
        <label>搜索词</label>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="例: 什么是向量数据库"
          @keydown.enter="doSearch"
        />
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" @click="doSearch">搜索</button>
        <button v-if="searchResults.length" class="btn btn-outline" @click="searchResults = []">清空结果</button>
      </div>

      <div v-if="searchResults.length" class="search-results">
        <div v-for="(r, i) in searchResults" :key="r.id" class="result-item">
          <div class="result-header">
            <span class="result-rank">#{{ i + 1 }}</span>
            <span class="result-score">score: {{ r.score.toFixed(4) }}</span>
            <span class="result-source">{{ r.source_label }}</span>
            <span class="result-chunk">chunk {{ r.chunk_index }}</span>
          </div>
          <p class="result-content">{{ r.content }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.kb-table th,
.kb-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.kb-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}
.content-cell {
  max-width: 28rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-muted, #374151);
}
.action-cell {
  white-space: nowrap;
  display: flex;
  gap: 0.3rem;
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
.file-hint {
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  margin-left: 0.5rem;
}
.empty-hint {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
  margin: 0.5rem 0;
}
.search-results {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.result-item {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  background: var(--bg-alt, #f8fafc);
  border-left: 3px solid #6366f1;
}
.result-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
  font-size: 0.8rem;
}
.result-rank {
  font-weight: 700;
  color: #6366f1;
}
.result-score {
  font-weight: 600;
  color: #16a34a;
}
.result-source {
  color: var(--text-muted, #6b7280);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-chunk {
  color: var(--text-muted, #9ca3af);
  font-family: monospace;
}
.result-content {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

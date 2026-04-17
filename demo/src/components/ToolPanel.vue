<script setup lang="ts">
import { ref } from "vue";
import { useClient } from "../composables/useClient";
import { useLog } from "../composables/useLog";
import LogBox from "./LogBox.vue";
import type { ToolResponse, BuiltinCatalogEntry, ToolType } from "@audarai/sdk";

const { client } = useClient();
const { entries, log, clear, logError } = useLog();

// ── Card 1: Tool List ──────────────────────────────────────────────────────────
const tools = ref<ToolResponse[]>([]);

async function listTools() {
  log("Fetching tool list...", "info");
  try {
    tools.value = await client.value!.tool.list();
    log(`Found ${tools.value.length} tools`, "ok");
  } catch (err) {
    logError(err);
  }
}

async function deleteTool(id: string) {
  log(`Deleting tool: ${id}...`, "info");
  try {
    await client.value!.tool.delete(id);
    tools.value = tools.value.filter(t => t.id !== id);
    log("Deleted successfully", "ok");
  } catch (err) {
    logError(err);
  }
}

// ── Card 2: Built-in Toolkit Catalog ──────────────────────────────────────────────────
const builtins = ref<BuiltinCatalogEntry[]>([]);

async function listBuiltins() {
  log("Fetching built-in toolkit catalog...", "info");
  try {
    builtins.value = await client.value!.tool.listBuiltins();
    log(`Found ${builtins.value.length} built-in toolkits`, "ok");
  } catch (err) {
    logError(err);
  }
}

function useBuiltin(entry: BuiltinCatalogEntry) {
  toolType.value = "builtin";
  builtinToolkit.value = entry.toolkit;
  log(`Populated built-in toolkit: ${entry.toolkit}`, "info");
}

// ── Card 3: 创建 Tool ──────────────────────────────────────────────────────────
const newTool = ref({ name: "", description: "" });
const toolType = ref<ToolType>("http");

// http 配置
const httpUrl = ref("");
const httpMethod = ref("GET");
const httpHeaders = ref("");
const httpTimeout = ref<number | "">(30);

// builtin 配置
const builtinToolkit = ref("");
const builtinInclude = ref("");
const builtinExclude = ref("");

// mcp 配置
const mcpTransport = ref<"sse" | "stdio">("sse");
const mcpServerUrl = ref("");
const mcpCommand = ref("");
const mcpArgs = ref("");
const mcpTimeout = ref<number | "">(30);

async function createTool() {
  if (!newTool.value.name.trim()) { log("请填写 Tool 名称", "warn"); return; }

  let config: Record<string, unknown>;

  if (toolType.value === "http") {
    if (!httpUrl.value.trim()) { log("请填写 URL", "warn"); return; }
    let parsedHeaders: Record<string, string> | undefined;
    if (httpHeaders.value.trim()) {
      try {
        parsedHeaders = JSON.parse(httpHeaders.value);
      } catch {
        log("headers 不是合法 JSON", "warn"); return;
      }
    }
    config = {
      url: httpUrl.value,
      method: httpMethod.value,
      ...(parsedHeaders ? { headers: parsedHeaders } : {}),
      ...(httpTimeout.value !== "" ? { timeout: httpTimeout.value } : {}),
    };
  } else if (toolType.value === "builtin") {
    if (!builtinToolkit.value.trim()) { log("请填写 toolkit 名称", "warn"); return; }
    config = {
      toolkit: builtinToolkit.value,
      ...(builtinInclude.value.trim() ? { include_tools: builtinInclude.value.split(",").map(s => s.trim()).filter(Boolean) } : {}),
      ...(builtinExclude.value.trim() ? { exclude_tools: builtinExclude.value.split(",").map(s => s.trim()).filter(Boolean) } : {}),
    };
  } else {
    // mcp
    config = {
      transport: mcpTransport.value,
      ...(mcpTransport.value === "sse" ? { server_url: mcpServerUrl.value } : { command: mcpCommand.value }),
      ...(mcpArgs.value.trim() ? { args: mcpArgs.value.split(" ").filter(Boolean) } : {}),
      ...(mcpTimeout.value !== "" ? { timeout: mcpTimeout.value } : {}),
    };
  }

  log(`创建 Tool: ${newTool.value.name}...`, "info");
  try {
    const created = await client.value!.tool.create({
      name: newTool.value.name,
      description: newTool.value.description || undefined,
      tool_type: toolType.value,
      config: config as any,
    });
    tools.value.push(created);
    log(`Tool 创建成功: ${created.id}`, "ok");
    newTool.value = { name: "", description: "" };
    httpUrl.value = "";
    httpHeaders.value = "";
    builtinToolkit.value = "";
    builtinInclude.value = "";
    builtinExclude.value = "";
    mcpServerUrl.value = "";
    mcpCommand.value = "";
    mcpArgs.value = "";
  } catch (err) {
    logError(err);
  }
}

const TYPE_COLOR: Record<ToolType, string> = {
  http:    "background:#dbeafe;color:#1d4ed8",
  builtin: "background:#dcfce7;color:#15803d",
  mcp:     "background:#fef9c3;color:#92400e",
};
</script>

<template>
  <div>
    <!-- Card 1: Tool List -->
    <div class="card">
      <h3>Tool List</h3>
      <div class="btn-row">
        <button class="btn btn-outline" @click="listTools">Refresh</button>
      </div>

      <table v-if="tools.length" class="tool-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tools" :key="t.id">
            <td class="id-cell" :title="t.id">{{ t.id.slice(0, 8) }}…</td>
            <td>{{ t.name }}</td>
            <td>
              <span class="badge" :style="TYPE_COLOR[t.tool_type]">{{ t.tool_type }}</span>
            </td>
            <td>{{ t.status }}</td>
            <td>{{ new Date(t.created_at).toLocaleString() }}</td>
            <td class="action-cell">
              <button class="btn btn-sm btn-danger" @click="deleteTool(t.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-hint">No tools yet. Click Refresh to load.</p>

      <LogBox :entries="entries" />
    </div>

    <!-- Card 2: Built-in Toolkit Catalog -->
    <div class="card">
      <h3>Built-in Toolkit Catalog</h3>
      <div class="btn-row">
        <button class="btn btn-outline" @click="listBuiltins">Load Catalog</button>
      </div>

      <table v-if="builtins.length" class="tool-table">
        <thead>
          <tr>
            <th>Toolkit</th>
            <th>Description</th>
            <th>Auth Required</th>
            <th>Auth Fields</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in builtins" :key="b.toolkit">
            <td><code>{{ b.toolkit }}</code></td>
            <td>{{ b.description }}</td>
            <td>{{ b.auth_required ? "Yes" : "No" }}</td>
            <td class="id-cell">{{ b.auth_fields.join(", ") || "—" }}</td>
            <td>
              <button class="btn btn-sm btn-outline" @click="useBuiltin(b)">Use</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-hint">Click Load Catalog to see all built-in toolkits.</p>
    </div>

    <!-- Card 3: Create Tool -->
    <div class="card">
      <h3>Create Tool</h3>

      <div class="row">
        <div class="field">
          <label>Name *</label>
          <input v-model="newTool.name" type="text" placeholder="My Tool" />
        </div>
        <div class="field">
          <label>Type</label>
          <select v-model="toolType">
            <option value="http">http</option>
            <option value="builtin">builtin</option>
            <option value="mcp">mcp</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>Description (optional)</label>
        <input v-model="newTool.description" type="text" placeholder="Describe the tool purpose" />
      </div>

      <!-- http config -->
      <template v-if="toolType === 'http'">
        <div class="sub-section">
          <h4>HTTP Config</h4>
          <div class="row">
            <div class="field" style="flex:3">
              <label>URL *</label>
              <input v-model="httpUrl" type="text" placeholder="https://api.example.com/endpoint" />
            </div>
            <div class="field" style="flex:1">
              <label>Method</label>
              <select v-model="httpMethod">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
                <option>PATCH</option>
              </select>
            </div>
            <div class="field" style="flex:1">
              <label>timeout (s)</label>
              <input v-model.number="httpTimeout" type="number" min="1" />
            </div>
          </div>
          <div class="field">
            <label>Headers (JSON, optional)</label>
            <textarea v-model="httpHeaders" rows="3" placeholder='{"Authorization": "Bearer xxx"}' />
          </div>
        </div>
      </template>

      <!-- builtin config -->
      <template v-else-if="toolType === 'builtin'">
        <div class="sub-section">
          <h4>Builtin Config</h4>
          <div class="field">
            <label>toolkit *</label>
            <input v-model="builtinToolkit" type="text" placeholder="e.g. web_search" />
          </div>
          <div class="row">
            <div class="field">
              <label>include_tools (comma-separated, optional)</label>
              <input v-model="builtinInclude" type="text" placeholder="search,summarize" />
            </div>
            <div class="field">
              <label>exclude_tools (comma-separated, optional)</label>
              <input v-model="builtinExclude" type="text" placeholder="dangerous_tool" />
            </div>
          </div>
        </div>
      </template>

      <!-- mcp config -->
      <template v-else>
        <div class="sub-section">
          <h4>MCP Config</h4>
          <div class="row">
            <div class="field">
              <label>transport</label>
              <select v-model="mcpTransport">
                <option value="sse">sse</option>
                <option value="stdio">stdio</option>
              </select>
            </div>
            <div class="field">
              <label>timeout (s)</label>
              <input v-model.number="mcpTimeout" type="number" min="1" />
            </div>
          </div>
          <template v-if="mcpTransport === 'sse'">
            <div class="field">
              <label>server_url</label>
              <input v-model="mcpServerUrl" type="text" placeholder="http://localhost:3000/sse" />
            </div>
          </template>
          <template v-else>
            <div class="row">
              <div class="field" style="flex:2">
                <label>command</label>
                <input v-model="mcpCommand" type="text" placeholder="npx" />
              </div>
              <div class="field" style="flex:3">
                <label>args (space-separated)</label>
                <input v-model="mcpArgs" type="text" placeholder="-y @modelcontextprotocol/server-everything" />
              </div>
            </div>
          </template>
        </div>
      </template>

      <div class="btn-row">
        <button class="btn btn-primary" @click="createTool">Create Tool</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.tool-table th,
.tool-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
}
.tool-table th {
  background: var(--bg-alt, #f8fafc);
  font-weight: 600;
}
.id-cell {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}
.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
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
.sub-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sub-section h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--text-muted, #6b7280);
}
.empty-hint {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
  margin: 0.5rem 0;
}
code {
  font-size: 0.82rem;
  background: var(--bg-alt, #f1f5f9);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}
</style>

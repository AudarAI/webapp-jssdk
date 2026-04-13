# @audarai/sdk

<div align="center">

**AudarAI 平台官方 JavaScript / TypeScript SDK**

*通过一个 SDK 即可构建具备语音能力的应用：文字转语音、语音转文字、实时翻译与 AI 智能体编排。*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [العربية](./README.ar.md)

</div>

---

## 概述

`@audarai/sdk` 是 **AudarAI** 平台的官方客户端库，提供生产级音频 AI 能力：

- **文字转语音（TTS）** — 高品质语音合成，支持自定义声音克隆
- **语音转文字（STT）** — 通过文件上传、SSE 流式或 WebSocket 实时转写
- **音频翻译** — 端到端 STT → 翻译 → TTS 流水线，支持实时推送
- **AI 智能体编排** — 创建、管理及与语音 AI 智能体交互
- **知识库** — 基于向量的语义检索，为智能体提供领域知识
- **工具与技能** — 通过 HTTP 工具、内置工具、MCP 及提示技能扩展智能体能力
- **房间与会话** — 集成 LiveKit 的多智能体语音房间

兼容**浏览器**与 **Node.js（18+）** 环境，完整 TypeScript 类型支持。

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [认证模式](#认证模式)
- [文字转语音（TTS）](#文字转语音tts)
- [语音转文字（STT）](#语音转文字stt)
- [音频翻译](#音频翻译)
- [智能体管理](#智能体管理)
- [知识库](#知识库)
- [工具](#工具)
- [技能](#技能)
- [原型](#原型)
- [房间](#房间)
- [会话](#会话)
- [错误处理](#错误处理)
- [Token 自动刷新](#token-自动刷新)
- [Node.js 兼容性](#nodejs-兼容性)
- [TypeScript 支持](#typescript-支持)
- [示例应用](#示例应用)

---

## 安装

### 从 GitHub 安装（推荐）

```bash
# npm
npm install @audarai/sdk@github:AudarAI/webapp-jssdk

# pnpm
pnpm add @audarai/sdk@github:AudarAI/webapp-jssdk

# yarn
yarn add @audarai/sdk@github:AudarAI/webapp-jssdk
```

或在 `package.json` 中指定：

```json
{
  "dependencies": {
    "@audarai/sdk": "github:AudarAI/webapp-jssdk"
  }
}
```

### 从本地路径安装

```bash
npm install /path/to/webapp-jssdk
```

---

## 快速开始

```typescript
import { createAudaraiClient } from '@audarai/sdk';

// 1. 创建客户端
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_your_key_here',
});

// 2. 合成语音
const audioBuffer = await client.tts.synthesize('你好，世界！', {
  voice: 'zh-CN-female',
  model: 'tts-1-hd',
  response_format: 'mp3',
});

// 3. 在浏览器中播放
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
new Audio(URL.createObjectURL(blob)).play();
```

---

## 认证模式

SDK 支持三种互斥的认证方式，必须且只能选择其中一种。

| 模式 | 配置字段 | HTTP 请求 | WebSocket |
|---|---|---|---|
| Publishable Key | `publishableKey` | 自动换取 session token | Session token |
| Access Token | `accessToken` | JWT 直接携带 | 自动换取 session token |
| API Key | `apiKey` | API Key 直接携带 | 自动换取 session token |

> WebSocket 端点仅接受短时 session token（`stk_` 前缀）。SDK 在建立连接前自动完成换取，无需手动处理。

### 模式一：publishableKey（前端直连，安全可嵌入）

`pk_` 密钥可安全嵌入前端代码，服务端会校验请求 `Origin` 是否在白名单内。

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_xxx',
});
```

> 使用前需在控制台创建 publishable key 并配置允许的来源：
> ```http
> POST /v1/account/api-keys
> { "name": "Web App", "key_type": "publishable", "allowed_origins": ["https://yourapp.com"] }
> ```

### 模式二：accessToken（SSO / OAuth2）

适用于已有 Keycloak 或其他 OAuth2 体系的场景。HTTP 请求直接携带 JWT，WebSocket 自动换取 session token。

```typescript
// 静态字符串
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  accessToken: 'eyJhbGciOiJSUzI1NiJ9...',
});

// 动态函数（推荐，支持 token 刷新）
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  accessToken: async () => keycloakAdapter.token,
});
```

### 模式三：apiKey（服务端 / 测试）

`ak_` 密钥具有完整权限，**严禁暴露在浏览器前端**，适合 Node.js 服务端或本地开发使用。

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  apiKey: 'ak_xxx',
});
```

---

## 文字转语音（TTS）

### 合成音频

```typescript
const audioBuffer = await client.tts.synthesize('你好，世界！', {
  voice: 'zh-CN-female',
  model: 'tts-1-hd',        // 'tts-1' | 'tts-1-hd'（默认：'tts-1'）
  response_format: 'mp3',    // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed: 1.0,                // 0.25 ~ 4.0
  provider: 'flash',         // 'flash' | 'turbo' | 'pro'
});

// 在浏览器中播放
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
new Audio(URL.createObjectURL(blob)).play();
```

### 流式合成

适用于长文本内容或低延迟播放场景。

```typescript
const response = await client.tts.synthesizeStream('长篇文字内容...', {
  voice: 'zh-CN-female',
  response_format: 'mp3',
});

// 写入文件（Node.js）
import { createWriteStream } from 'fs';
const writer = createWriteStream('output.mp3');
response.body!.pipeTo(
  new WritableStream({ write: (chunk) => writer.write(chunk) })
);
```

### 自定义声音管理

```typescript
// 列出可用声音
const voices: string[] = await client.tts.listSpeakers();

// 克隆声音（上传音频样本）
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.tts.addSpeaker('my-voice', file, '这是录音的文字内容', {
  description: '自定义声音描述',
});

// 删除自定义声音
await client.tts.deleteSpeaker('my-voice');
```

---

## 语音转文字（STT）

### 转写音频文件

```typescript
const result = await client.stt.transcribe(audioBlob, {
  language: 'zh',
  forced_alignment: false,  // 开启词级时间戳
  provider: 'flash',        // 'flash' | 'turbo'
});

console.log(result.text);        // 转写文本
console.log(result.language);    // 识别出的语言代码
console.log(result.timestamps);  // 词级时间戳（forced_alignment 为 true 时有值）
```

### 流式转写（SSE）

在服务端处理音频的同时接收增量结果。

```typescript
const result = await client.stt.transcribeStream(
  audioBlob,
  { language: 'zh', provider: 'flash' },
  {
    onChunk: (chunk) => console.log('增量:', chunk.text, '序号:', chunk.chunk_index),
    onFinal: (chunk) => console.log('最终:', chunk.text),
    onError: (err)  => console.error('错误:', err),
  },
);

console.log(result.text);      // 完整转写文本
console.log(result.language);  // 识别语言
```

### 实时转写（WebSocket）

适用于麦克风实时输入，延迟极低。

```typescript
const stt = await client.stt.connectWebSocket(
  { language: 'zh', provider: 'flash' },
  {
    onReady:   ({ session_id }) => console.log('会话就绪:', session_id),
    onPartial: ({ text })       => console.log('实时:', text),
    onSegment: ({ text, segment_index }) => console.log(`分段 ${segment_index}:`, text),
    onFinal:   ({ text })       => console.log('完成:', text),
    onError:   (e)              => console.error('错误:', e),
    onClose:   ()               => console.log('连接已关闭'),
  },
);

// 发送原始 PCM 音频帧（ArrayBuffer 或 Int16Array）
stt.sendAudio(pcmBuffer);

// 结束录音——服务端自动 flush 并关闭连接
stt.stop();
```

---

## 音频翻译

### 文件翻译（SSE 流水线）

`translate()` 按阶段推送事件：**STT → 翻译 → TTS**，方法返回最终结果。

```typescript
const result = await client.translation.translate(
  audioBlob,
  {
    target_lang: 'en',
    source_lang: 'zh',            // 可选，不传则自动检测
    translation_mode: 'llm',      // 'llm'（默认）| 'mt'（机器翻译）
    tts_enabled: true,
    response_format: 'mp3',
    voice: 'en-US-female',
  },
  {
    onStatus:              ({ stage, message }) => console.log(stage, message),
    onSttPartial:          ({ text })           => showSubtitle(text),
    onSttFinal:            ({ text })           => console.log('STT:', text),
    onTranslationPartial:  ({ text })           => showTranslation(text),
    onTranslationComplete: ({ text })           => console.log('译文:', text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onTtsComplete:         ({ total_chunks })   => console.log('TTS 完成'),
    onPipelineComplete:    ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onError:               ({ stage, message }) => console.error(stage, message),
  },
);

console.log(result.source_text);  // 原文
console.log(result.text);         // 译文
```

### 实时翻译（WebSocket）

端到端麦克风实时翻译。

```typescript
const ws = await client.translation.connectWebSocket(
  {
    target_lang: 'en',
    source_lang: 'zh',
    tts_enabled: true,
    translation_mode: 'llm',
    response_format: 'mp3',
  },
  {
    onReady:               ({ session_id }) => console.log('会话:', session_id),
    onSttPartial:          ({ text })       => showSubtitle(text),
    onSttSegment:          ({ text, segment_index }) => console.log('分段:', text),
    onTranslationComplete: ({ text, target_lang })   => showTranslation(text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onSegmentComplete:     ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onPipelineComplete:    ({ duration }) => console.log(`完成，耗时 ${duration}s`),
    onError:               ({ message, stage }) => console.error(stage, message),
    onClose:               () => console.log('已断开'),
  },
);

// 发送麦克风 PCM 音频帧
ws.sendAudio(pcmBuffer);

// 结束会话
ws.stop();
```

---

## 智能体管理

### 创建与管理智能体

```typescript
// 列出当前租户所有智能体
const agents = await client.agent.listAgents();

// 列出平台预设智能体（所有认证用户可见）
const platformAgents = await client.agent.listPlatformAgents();

// 创建智能体
const agent = await client.agent.createAgent({
  name: '客服助手',
  description: '面向终端用户的语音客服智能体',
  system_prompt: '你是一名专业客服，请用简洁友好的语气回答用户问题。',
  voice_id: 'zh-CN-female',
  language: 'zh',
  archetype_id: 'archetype-uuid',          // 可选
  knowledge_bindings: ['kb-uuid'],         // 绑定知识库
  skills: ['skill-uuid'],                  // 绑定技能
  memory_policy: {
    enable_memory: true,
    num_history_turns: 10,
  },
});

// 获取 / 更新 / 删除
const detail = await client.agent.getAgent(agent.id);
await client.agent.updateAgent(agent.id, { name: '新名称' });
await client.agent.deleteAgent(agent.id);
```

### 快速发起对话

`chat()` 创建会话并返回 `{ session_id, room_id }`，再调用 `getLiveKitToken()` 即可接入语音。

```typescript
const { session_id } = await client.agent.chat(agentId, '你好！', {
  voice_id: 'zh-CN-female',  // 可选，覆盖智能体默认声音
});

// 获取 LiveKit token，用于语音连接
const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);

// 使用 @livekit/client 连接
import { Room } from '@livekit/client';
const room = new Room();
await room.connect(livekit_url, token);
```

---

## 知识库

### 创建与管理知识库

```typescript
const kbs = await client.knowledge.list();

const kb = await client.knowledge.create({
  name: '产品手册',
  description: '产品相关 FAQ 和操作说明',
});

await client.knowledge.update(kb.id, { name: '产品手册 v2' });
await client.knowledge.delete(kb.id);
```

### 摄取内容

```typescript
// 摄取纯文本（异步，返回 202 Accepted）
await client.knowledge.ingest(kb.id, {
  source_type: 'text',
  text: '需要嵌入和索引的内容...',
  source_label: '手动录入',
  language: 'zh',
});

// 摄取 URL
await client.knowledge.ingest(kb.id, {
  source_type: 'url',
  url: 'https://example.com/docs/api',
});

// 上传文件
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.knowledge.ingestFile(kb.id, file, file.name);
```

### 向量语义检索

```typescript
const results = await client.knowledge.search(kb.id, {
  query: '如何重置密码？',
  top_k: 5,       // 返回条数（默认：5）
  language: 'zh',
});

results.forEach(r => {
  console.log(`[${r.score.toFixed(3)}] ${r.content}`);
});
```

### 文档管理

```typescript
const docs = await client.knowledge.listDocuments(kb.id);
await client.knowledge.deleteDocument(kb.id, docId);

// 触发重新摄取所有文档
await client.knowledge.reingest(kb.id);
```

---

## 工具

通过外部能力扩展智能体：HTTP API、内置工具（网页搜索）及 MCP 服务器。

### 创建工具

```typescript
// HTTP 工具——调用任意 REST API
const httpTool = await client.tool.create({
  name: '天气查询',
  tool_type: 'http',
  config: {
    url: 'https://api.weather.com/v1/current',
    method: 'GET',
    headers: { 'X-API-Key': 'xxx' },
  },
});

// 内置工具（如网页搜索）
const searchTool = await client.tool.create({
  name: '网页搜索',
  tool_type: 'builtin',
  config: { toolkit: 'web_search' },
});

// MCP 工具（SSE 传输）
const mcpTool = await client.tool.create({
  name: 'MCP 工具',
  tool_type: 'mcp',
  config: {
    transport: 'sse',
    server_url: 'https://mcp.example.com/sse',
  },
});

await client.tool.update(httpTool.id, { name: '天气查询 v2' });
await client.tool.delete(httpTool.id);
```

### 查看内置工具目录

```typescript
const builtins = await client.tool.listBuiltins();
builtins.forEach(b => console.log(`${b.toolkit} — ${b.description}`));
```

---

## 技能

技能是注入到智能体 system prompt 的 Markdown 片段，用于扩展或专业化智能体行为，无需修改基础提示词。

```typescript
const skills = await client.skill.list();

const skill = await client.skill.create({
  name: '礼貌用语',
  description: '要求智能体始终使用敬语',
  content: `## 礼仪规范\n- 始终使用"您"称呼用户\n- 回答结尾加上"请问还有什么需要帮助的吗？"`,
});

await client.skill.update(skill.id, { content: '更新后的技能内容...' });
await client.skill.delete(skill.id);
```

---

## 原型

原型是可复用的基础配置——包含基础 system prompt 和默认技能集合。将原型分配给多个智能体，确保行为一致。

```typescript
const archetypes = await client.archetype.list();

const arch = await client.archetype.create({
  name: '客服原型',
  description: '所有客服智能体的基础配置',
  base_prompt: '你是一名专业客服...',
});

await client.archetype.update(arch.id, { base_prompt: '更新后的基础提示词...' });
await client.archetype.delete(arch.id);
```

---

## 房间

房间是多轮语音会话的持久容器，可承载多个智能体和多个并发会话。

### 创建与管理房间

```typescript
const rooms = await client.agent.rooms.list();

const room = await client.agent.rooms.create({
  name: '客服大厅',
  description: '面向用户的实时语音客服房间',
  talking_style: 'sequential',   // 'sequential' | 'moderator_led' | 'freeform'
  visibility: 'private',         // 'private' | 'shared' | 'public'
  agent_ids: [agentId],
});

await client.agent.rooms.update(room.id, { name: '新名称' });
await client.agent.rooms.delete(room.id);
```

### 管理房间内的智能体

```typescript
const { agent_ids } = await client.agent.rooms.listAgents(room.id);

await client.agent.rooms.addAgent(room.id, agentId);
await client.agent.rooms.removeAgent(room.id, agentId);
```

### 在房间内开启会话

```typescript
// 开启新会话
const session = await client.agent.rooms.startSession(room.id, {
  voice_id: 'zh-CN-female',  // 可选，覆盖智能体默认声音
});

// 列出房间所有会话
const sessions = await client.agent.rooms.listSessions(room.id);
```

---

## 会话

### 生命周期管理

```typescript
// 列出所有会话（支持分页和状态过滤）
const { data, total } = await client.agent.sessions.list({
  status: 'running',  // 'running' | 'paused' | 'ended'
  page: 1,
  page_size: 20,
});

const session = await client.agent.sessions.get(sessionId);

await client.agent.sessions.pause(sessionId);
await client.agent.sessions.resume(sessionId);
await client.agent.sessions.end(sessionId);

const participants = await client.agent.sessions.getParticipants(sessionId);
```

### 消息记录

```typescript
// 查看对话历史
const { data: messages } = await client.agent.sessions.listMessages(sessionId, {
  page: 1,
  page_size: 50,
});

// 向会话追加消息
await client.agent.sessions.appendMessage(sessionId, {
  role: 'user',
  content: '请帮我查一下订单状态。',
  speaker_type: 'user',
  speaker_ref_id: 'user-uuid',
});
```

### 语音接入（LiveKit）

```typescript
// 获取首位参与者的 token
const { token, livekit_url, room_name } = await client.agent.sessions.getLiveKitToken(sessionId, {
  user_id: 'end-user-123',
  user_name: '张三',
});

// 以新参与者身份加入已有会话
const { token, livekit_url } = await client.agent.sessions.join(sessionId, {
  user_id: 'end-user-456',
});

// 使用 @livekit/client 连接
import { Room } from '@livekit/client';
const livekitRoom = new Room();
await livekitRoom.connect(livekit_url, token);
```

### 参与者上下文

在运行时动态覆盖单个参与者的配置。

```typescript
await client.agent.sessions.upsertParticipantContext(sessionId, 'user-ref-id', {
  custom_prompt: '请仅使用中文回答。',
  variables: { userName: '李四' },
});

await client.agent.sessions.deleteParticipantContext(sessionId, 'user-ref-id');
```

---

## 错误处理

SDK 为每种错误场景导出了对应的类型化异常类。

```typescript
import {
  AudaraiError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
  ApiError,
} from '@audarai/sdk';

try {
  const audio = await client.tts.synthesize('你好');
} catch (err) {
  if (err instanceof AuthenticationError) {
    // 凭证无效或已过期
    console.error('认证失败，请检查凭证。');
  } else if (err instanceof InsufficientBalanceError) {
    // HTTP 402 — 账户余额不足
    console.error('余额不足，请充值。');
  } else if (err instanceof RateLimitedError) {
    // HTTP 429 — 请求过于频繁
    console.error(`请求过频，请 ${err.retryAfter}s 后重试。`);
  } else if (err instanceof ApiError) {
    // 其他 HTTP 错误
    console.error(`API 错误 ${err.statusCode}: ${err.message}`);
  }
}
```

---

## Token 自动刷新

SDK 在每次请求前主动检查 token 是否即将过期（默认提前 30 秒刷新），通过互斥锁防止并发重复刷新。收到 `401` 响应时，自动清除缓存 token 并重试一次。

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_xxx',
  refreshThresholdSeconds: 60,  // 提前 60 秒刷新（默认：30）
});
```

---

## Node.js 兼容性

Node.js 18+ 原生支持 `fetch`，无需任何额外配置。

对于 **Node.js < 18**，需传入自定义 `fetch` 实现：

```typescript
import fetch from 'node-fetch';

const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  apiKey: 'ak_xxx',
  fetch: fetch as typeof globalThis.fetch,
});
```

---

## TypeScript 支持

SDK 完全由 TypeScript 编写，开箱即用，附带完整类型声明。每个请求选项、响应结构及回调签名均已完整定义。

```typescript
import {
  createAudaraiClient,
  type AudaraiClientConfig,
  type SynthesizeOptions,
  type TranscribeResult,
  type AgentResponse,
  type SessionResponse,
  type KnowledgeResponse,
  type TranslationResult,
  AudaraiError,
  AuthenticationError,
  ApiError,
} from '@audarai/sdk';
```

---

## 示例应用

`demo/` 目录中包含一个完整的 Vue 3 + Vite 示例应用，提供了 SDK 所有功能的交互式界面，包括实时麦克风录音、日志查看和 LiveKit 语音会话。

```bash
cd demo
npm install
npm run dev
```

访问 `http://localhost:5173`，输入凭证后即可交互式探索所有能力。

---

## 许可证

MIT — 详见 [LICENSE](./LICENSE)。

---

<div align="center">
由 <strong>AudarAI</strong> 团队用心构建。<br/>
有问题？欢迎提 Issue 或访问 <a href="https://audarai.com">audarai.com</a>。
</div>

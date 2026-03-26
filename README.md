# @aivox/sdk

AiVox JavaScript / TypeScript SDK，支持 TTS、STT、实时语音转写和语音翻译。

## 安装

### 从 GitHub 安装（推荐）

```bash
# npm
npm install @aivox/sdk@github:AudarAI/webapp-jssdk

# pnpm
pnpm add @aivox/sdk@github:AudarAI/webapp-jssdk

# yarn
yarn add @aivox/sdk@github:AudarAI/webapp-jssdk
```

或在 `package.json` 中：

```json
{
  "dependencies": {
    "@aivox/sdk": "github:AudarAI/webapp-jssdk"
  }
}
```

### 从本地路径安装

```bash
npm install /path/to/AiVox2/sdk/javascript
```

或在 `package.json` 中：

```json
{
  "dependencies": {
    "@aivox/sdk": "file:../../sdk/javascript"
  }
}
```

---

## 认证模式

SDK 支持三种认证方式，必须且只能选择其中一种。

| 模式 | 配置字段 | HTTP 请求 | WebSocket |
|---|---|---|---|
| Publishable Key | `publishableKey` | session token（自动换取） | session token |
| Access Token | `accessToken` | JWT 直接用 | session token（自动换取） |
| API Key | `apiKey` | API Key 直接用 | session token（自动换取） |

WebSocket 端点只接受短时 session token（`stk_` 前缀），SDK 会在建立连接前自动完成换取，无需手动处理。

### 模式一：publishableKey（前端直连，无需后端）

`pk_` 密钥可安全嵌入前端代码，所有请求（HTTP 和 WebSocket）均自动使用短时 session token。服务端会校验请求 `Origin` 是否在白名单内。

```typescript
import { createAiVoxClient } from '@aivox/sdk';

const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  publishableKey: 'pk_xxx',
});
```

> 需先在控制台创建 publishable key 并配置允许的来源：
> ```http
> POST /v1/account/api-keys
> { "name": "Web App", "key_type": "publishable", "allowed_origins": ["https://myapp.com"] }
> ```

### 模式二：accessToken（SSO / OAuth2）

适用于已有 Keycloak / OAuth2 体系的场景。HTTP 请求直接携带 JWT，WebSocket 自动换取 session token。

支持传入静态字符串或动态函数（推荐，可随时获取最新 token）：

```typescript
// 静态 JWT
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  accessToken: 'eyJhbGciOiJSUzI1NiJ9...',
});

// 动态函数（推荐）— 每次刷新时调用
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  accessToken: async () => keycloakAdapter.token,
});
```

### 模式三：apiKey（服务端 / 测试）

`ak_` 密钥具有完整权限，**不应暴露在浏览器前端**，适合 Node.js 服务端或本地测试。HTTP 请求直接携带 API Key，WebSocket 自动换取 session token。

```typescript
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  apiKey: 'ak_xxx',
});
```

---

## TTS（文字转语音）

### 合成音频

```typescript
const audioBuffer = await client.tts.synthesize('你好，世界', {
  voice: 'zh-CN-female',
  model: 'tts-1',           // tts-1 | tts-1-hd，默认 tts-1
  response_format: 'mp3',   // mp3 | opus | aac | flac | wav | pcm
  speed: 1.0,               // 0.25 ~ 4.0
  provider: 'flash',        // flash | turbo | pro
});

// 在浏览器中播放
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
const url = URL.createObjectURL(blob);
new Audio(url).play();
```

### 流式合成

```typescript
const response = await client.tts.synthesizeStream('长篇文字内容...', {
  voice: 'zh-CN-female',
});

// 将流写入文件（Node.js）
import { createWriteStream } from 'fs';
const writer = createWriteStream('output.mp3');
response.body!.pipeTo(
  new WritableStream({ write: (chunk) => writer.write(chunk) })
);
```

### 管理声音

```typescript
// 列出可用声音
const names: string[] = await client.tts.listSpeakers();

// 上传自定义声音
const audioFile = document.querySelector('input[type=file]').files[0];
await client.tts.addSpeaker('my-voice', audioFile, '这是录音文本', {
  description: '自定义声音描述',
});

// 删除声音
await client.tts.deleteSpeaker('my-voice');
```

---

## STT（语音转文字）

### 转写音频文件

```typescript
const result = await client.stt.transcribe(audioBlob, {
  language: 'zh',
  forced_alignment: false,
  provider: 'flash',  // flash | turbo
});

console.log(result.text);        // 转写文本
console.log(result.language);    // 识别语言
console.log(result.timestamps);  // 词级时间戳（forced_alignment 时有值）
```

### 流式转写（SSE）

```typescript
const result = await client.stt.transcribeStream(
  audioBlob,
  { language: 'zh', provider: 'flash' },
  {
    onChunk: (chunk) => console.log('增量:', chunk.text, chunk.chunk_index),
    onFinal: (chunk) => console.log('最终:', chunk.text),
    onError: (err)  => console.error(err),
  },
);
// result: { text, language }
```

### 实时转写（WebSocket）

```typescript
const stt = await client.stt.connectWebSocket(
  { language: 'zh', provider: 'flash' },
  {
    onReady:   ({ session_id }) => console.log('会话:', session_id),
    onPartial: ({ text })       => console.log('实时:', text),
    onSegment: ({ text, segment_index }) => console.log('分段:', segment_index, text),
    onFinal:   ({ text })       => console.log('完成:', text),
    onError:   (e)              => console.error(e),
    onClose:   ()               => console.log('已断开'),
  },
);

// 发送 PCM 音频帧（ArrayBuffer 或 Int16Array）
stt.sendAudio(pcmBuffer);

// 结束录音（服务端自动 flush 并关闭）
stt.stop();
```

---

## Translation（语音翻译）

### 翻译音频文件（SSE 流水线）

`translate()` 通过 SSE 依次推送 STT → 翻译 → TTS 各阶段事件，方法返回最终结果。

```typescript
const result = await client.translation.translate(
  audioBlob,
  {
    target_lang: 'en',
    source_lang: 'zh',          // 可选，不传则自动检测
    translation_mode: 'llm',    // llm（默认）| mt
    tts_enabled: true,
    response_format: 'mp3',
    voice: 'en-US-female',
  },
  {
    onStatus:             ({ stage, message }) => console.log(stage, message),
    onSttPartial:         ({ text })           => showSubtitle(text),
    onSttFinal:           ({ text })           => console.log('STT:', text),
    onTranslationPartial: ({ text })           => showTranslation(text),
    onTranslationComplete:({ text })           => console.log('译文:', text),
    onTtsChunk:           (audio, { format, sample_rate }) => playAudio(audio),
    onTtsComplete:        ({ total_chunks })   => console.log('TTS 完成'),
    onPipelineComplete:   ({ source_text, translated_text }) =>
      console.log(source_text, '->', translated_text),
    onError:              ({ stage, message }) => console.error(stage, message),
  },
);

console.log(result.source_text);  // 原文
console.log(result.text);         // 译文
```

### 实时翻译（WebSocket）

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
    onReady:              ({ session_id }) => console.log('会话:', session_id),
    onSttPartial:         ({ text })       => showSubtitle(text),
    onSttSegment:         ({ text, segment_index }) => console.log('分段:', text),
    onTranslationComplete:({ text, target_lang })   => showTranslation(text),
    onTtsChunk:           (audio, { format, sample_rate }) => playAudio(audio),
    onSegmentComplete:    ({ source_text, translated_text }) =>
      console.log(source_text, '->', translated_text),
    onPipelineComplete:   ({ duration }) => console.log('完成，耗时', duration, 's'),
    onError:              ({ message, stage }) => console.error(stage, message),
    onClose:              () => console.log('已断开'),
  },
);

// 发送 PCM 音频帧
ws.sendAudio(pcmBuffer);

// 结束会话
ws.stop();
```

---

## Agent 管理

### 列出 / 创建 / 更新 / 删除 Agent

```typescript
// 列出当前租户的所有 agent
const agents = await client.agent.listAgents();

// 列出平台预设 agent（所有认证用户可见）
const platformAgents = await client.agent.listPlatformAgents();

// 创建 agent
const agent = await client.agent.createAgent({
  name: '客服助手',
  description: '面向终端用户的语音客服 agent',
  system_prompt: '你是一名专业客服，请用简洁友好的语气回答用户问题。',
  voice_id: 'zh-CN-female',
  language: 'zh',
  archetype_id: 'archetype-uuid',     // 可选
  knowledge_bindings: ['kb-uuid'],    // 绑定知识库
  skills: ['skill-uuid'],             // 绑定技能
  memory_policy: { enable_memory: true, num_history_turns: 10 },
});

// 获取 / 更新 / 删除
const detail = await client.agent.getAgent(agent.id);
await client.agent.updateAgent(agent.id, { name: '新名称' });
await client.agent.deleteAgent(agent.id);
```

### 快速发起对话（chat）

`chat()` 返回 `{ session_id, room_id }`，再调用 `getLiveKitToken()` 即可接入语音。

```typescript
const { session_id } = await client.agent.chat(agentId, '你好', {
  voice_id: 'zh-CN-female',  // 可选，覆盖 agent 默认声音
});

// 获取 LiveKit token，用于加入语音房间
const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);
// 使用 @livekit/client SDK 连接
```

---

## Archetype（原型）

原型定义了 agent 的基础 prompt 和默认技能，可复用于多个 agent。

```typescript
// CRUD
const archetypes = await client.archetype.list();
const arch = await client.archetype.create({
  name: '客服原型',
  description: '通用客服角色定义',
  base_prompt: '你是一名专业客服...',
});
const detail = await client.archetype.get(arch.id);
await client.archetype.update(arch.id, { base_prompt: '更新后的 prompt' });
await client.archetype.delete(arch.id);
```

---

## Knowledge（知识库）

### CRUD

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
// 摄取纯文本（异步，返回 202）
await client.knowledge.ingest(kb.id, {
  source_type: 'text',
  text: '这是要摄取的文本内容...',
  source_label: '手动录入',
  language: 'zh',
});

// 摄取 URL
await client.knowledge.ingest(kb.id, {
  source_type: 'url',
  url: 'https://example.com/docs',
});

// 上传文件
const file = document.querySelector('input[type=file]').files[0];
await client.knowledge.ingestFile(kb.id, file, file.name);
```

### 向量检索

```typescript
const results = await client.knowledge.search(kb.id, {
  query: '如何重置密码',
  top_k: 5,      // 返回条数，默认 5
  language: 'zh',
});

results.forEach(r => {
  console.log(`[${r.score.toFixed(3)}] ${r.content}`);
});
```

---

## Tool（工具）

### CRUD

```typescript
const tools = await client.tool.list();

// HTTP 工具
const httpTool = await client.tool.create({
  name: '天气查询',
  tool_type: 'http',
  config: {
    url: 'https://api.weather.com/v1/current',
    method: 'GET',
    headers: { 'X-API-Key': 'xxx' },
  },
});

// 内置工具（Builtin）
const builtinTool = await client.tool.create({
  name: '网页搜索',
  tool_type: 'builtin',
  config: { toolkit: 'web_search' },
});

// MCP 工具
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
builtins.forEach(b => {
  console.log(b.toolkit, '-', b.description);
});
```

---

## Skill（技能）

技能是注入到 agent system prompt 的 Markdown 片段，用于扩展 agent 行为。

```typescript
const skills = await client.skill.list();
const skill = await client.skill.create({
  name: '礼貌用语',
  description: '要求 agent 始终使用敬语',
  content: '## 礼仪规范\n- 始终使用"您"称呼用户\n- 回答结尾加上"请问还有什么需要帮助的吗？"',
});
await client.skill.update(skill.id, { content: '更新后的技能内容' });
await client.skill.delete(skill.id);
```

---

## Room（房间）

房间是承载多轮对话 session 的容器，可绑定多个 agent。

### CRUD

```typescript
const rooms = await client.agent.rooms.list();
const room = await client.agent.rooms.create({
  name: '客服大厅',
  description: '面向用户的实时语音客服房间',
  talking_style: 'sequential',  // sequential | moderator_led | freeform
  visibility: 'private',        // private | shared | public
  agent_ids: [agentId],
});
await client.agent.rooms.update(room.id, { name: '新名称' });
await client.agent.rooms.delete(room.id);
```

### 管理房间内的 Agent

```typescript
// 查看房间 agent 列表
const { agent_ids } = await client.agent.rooms.listAgents(room.id);

// 添加 / 移除 agent
await client.agent.rooms.addAgent(room.id, agentId);
await client.agent.rooms.removeAgent(room.id, agentId);
```

### 创建 / 列出 Session

```typescript
// 在房间内开启新 session
const session = await client.agent.rooms.startSession(room.id, {
  voice_id: 'zh-CN-female',  // 可选，覆盖 agent 默认声音
});

// 列出房间所有 session
const sessions = await client.agent.rooms.listSessions(room.id);
```

---

## Session（会话）

### 生命周期

```typescript
// 列出当前租户所有 session（支持分页和状态过滤）
const { data, total } = await client.agent.sessions.list({
  status: 'running',
  page: 1,
  page_size: 20,
});

// 查看单个 session
const session = await client.agent.sessions.get(sessionId);

// 暂停 / 恢复 / 结束
await client.agent.sessions.pause(sessionId);
await client.agent.sessions.resume(sessionId);
await client.agent.sessions.end(sessionId);

// 查看参与者
const participants = await client.agent.sessions.getParticipants(sessionId);
```

### 消息记录

```typescript
// 查看消息历史
const { data: messages } = await client.agent.sessions.listMessages(sessionId, {
  page: 1,
  page_size: 50,
});

// 追加消息
await client.agent.sessions.appendMessage(sessionId, {
  role: 'user',
  content: '请帮我查一下订单状态',
  speaker_type: 'user',
  speaker_ref_id: 'user-uuid',
});
```

### 加入语音（LiveKit）

```typescript
// 获取 LiveKit token（首次加入）
const { token, livekit_url, room_name } = await client.agent.sessions.getLiveKitToken(sessionId, {
  user_id: 'end-user-123',     // 第三方用户 ID，用作 LiveKit participant identity
  user_name: '张三',            // 显示名称
});

// 以新参与者身份加入已有 session
const { token, livekit_url } = await client.agent.sessions.join(sessionId, {
  user_id: 'end-user-456',
});

// 使用 @livekit/client 连接
// import { Room } from '@livekit/client';
// const room = new Room();
// await room.connect(livekit_url, token);
```

---

## 错误处理

```typescript
import {
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
  ApiError,
} from '@aivox/sdk';

try {
  const audio = await client.tts.synthesize('你好');
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('认证失败，请检查凭证');
  } else if (err instanceof InsufficientBalanceError) {
    console.error('余额不足，请充值');
  } else if (err instanceof RateLimitedError) {
    console.error(`请求过频，请 ${err.retryAfter}s 后重试`);
  } else if (err instanceof ApiError) {
    console.error(`API 错误 ${err.statusCode}: ${err.message}`);
  }
}
```

---

## Token 自动刷新

SDK 在每次请求前检查 token 是否即将过期（默认提前 30 秒刷新），通过互斥锁防止并发重复刷新。收到 401 响应时自动清除缓存并重试一次。

```typescript
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  publishableKey: 'pk_xxx',
  refreshThresholdSeconds: 60, // 提前 60 秒刷新（默认 30）
});
```

---

## Node.js 环境

Node.js 18+ 原生支持 `fetch`，无需额外配置。18 以下需传入自定义 fetch：

```typescript
import fetch from 'node-fetch';

const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  apiKey: 'ak_xxx',
  fetch: fetch as typeof globalThis.fetch,
});
```



# @aivox/sdk

AiVox JavaScript / TypeScript SDK，支持 TTS、STT、实时语音转写和语音翻译。

## 安装

**先构建 SDK：**

```bash
cd sdk/javascript
npm install
npm run build   # 输出 dist/index.js、dist/index.mjs、dist/index.d.ts
```

**在项目中引用本地路径：**

```bash
# npm
npm install /path/to/AiVox2/sdk/javascript

# pnpm
pnpm add /path/to/AiVox2/sdk/javascript

# 或在 package.json 中直接写相对路径
```

```json
{
  "dependencies": {
    "@aivox/sdk": "file:../../sdk/javascript"
  }
}
```

---

## 认证模式

SDK 支持三种认证方式，按推荐程度排序：

### 模式一：tokenProvider（有后端，推荐）

后端持有 `ak_` 密钥，前端通过自己的接口换取短期 token。密钥**永远不出现**在前端代码中。

```typescript
import { createAiVoxClient } from '@aivox/sdk';

const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  tokenProvider: async () => {
    const res = await fetch('/your-backend/get-speech-token');
    return res.json(); // 需返回 { token: 'stk_...', expires_in: 300 }
  },
});
```

后端示例（Node.js / Express）：
```typescript
app.get('/your-backend/get-speech-token', async (req, res) => {
  const r = await fetch('https://api.aivox.com/v1/speech/session-tokens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.AIVOX_API_KEY}`, // ak_xxx
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: 300 }),
  });
  res.json((await r.json()).data); // { token, expires_in, expires_at }
});
```

### 模式二：publishableKey（无后端）

`pk_` 密钥可安全嵌入前端，服务端会校验请求的 `Origin` 是否在白名单内。

```typescript
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  publishableKey: 'pk_xxx', // 只能换取 session token，无法直接调用 TTS/STT
});
```

> 需先在控制台创建 publishable key 并配置 `allowed_origins`：
> ```http
> POST /v1/account/api-keys
> { "name": "Web App", "key_type": "publishable", "allowed_origins": ["https://myapp.com"] }
> ```

### 模式三：sessionToken（测试用）

直接传入已有的 `stk_` token，不自动刷新。

```typescript
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  sessionToken: 'stk_xxx',
});
```

---

## TTS（文字转语音）

### 合成音频

```typescript
const audioBuffer = await client.tts.synthesize('你好，世界', {
  voice: 'zh-CN-female',
  model: 'tts-1',
  response_format: 'mp3', // mp3 | opus | aac | flac | wav | pcm
  speed: 1.0,
});

// 在浏览器中播放
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
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
const speakers = await client.tts.listSpeakers();
const speakers = await client.tts.listSpeakers('provider-name'); // 按 provider 过滤

// 上传自定义声音
const audioFile = document.querySelector('input[type=file]').files[0];
await client.tts.addSpeaker('my-voice', audioFile, {
  transcript: '这是录音文本',
  description: '自定义声音描述',
});

// 删除声音
await client.tts.deleteSpeaker('my-voice');
```

---

## STT（语音转文字）

### 转写音频文件

```typescript
const audioBlob = ...; // Blob | File

const result = await client.stt.transcribe(audioBlob, {
  language: 'zh',
  context: '可选的上下文提示',
  forced_alignment: false,
});

console.log(result.text);      // 转写文本
console.log(result.language);  // 识别语言
console.log(result.segments);  // 时间戳分段
```

### 流式转写（SSE）

```typescript
const response = await client.stt.transcribeStream(audioBlob, {
  language: 'zh',
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```

### 实时转写（WebSocket）

```typescript
const ws = await client.stt.connectWebSocket({
  language: 'zh',
  provider: 'flash',
});

ws.onopen = () => console.log('已连接');
ws.onmessage = (e) => console.log('识别结果:', e.data);
ws.onerror = (e) => console.error('错误:', e);

// 发送音频数据（ArrayBuffer）
function sendAudio(pcmBuffer: ArrayBuffer) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(pcmBuffer);
  }
}

// 结束
ws.close();
```

---

## Translation（语音翻译）

### 翻译音频文件

```typescript
// 仅返回文字
const result = await client.translation.translate(audioBlob, {
  target_lang: 'en',
  source_lang: 'zh',          // 可选，不传则自动检测
  translation_mode: 'text',
});
console.log(result.text);

// 同时合成目标语言语音
const audioBuffer = await client.translation.translate(audioBlob, {
  target_lang: 'en',
  source_lang: 'zh',
  tts_enabled: true,
  response_format: 'mp3',
  voice: 'en-US-female',
});
```

### 实时翻译（WebSocket）

```typescript
const ws = await client.translation.connectWebSocket({
  target_lang: 'en',
  source_lang: 'zh',
  tts_enabled: true,
  translation_mode: 'speech',
  response_format: 'mp3',
});

ws.onopen = () => console.log('已连接');
ws.onmessage = (e) => {
  if (e.data instanceof Blob) {
    // 合成音频数据
  } else {
    console.log('翻译结果:', e.data);
  }
};

// 发送音频帧
ws.send(pcmBuffer);

// 结束会话
ws.send(JSON.stringify({ type: 'stop' }));
```

---

## 错误处理

```typescript
import {
  InsufficientBalanceError,
  RateLimitedError,
  AuthenticationError,
  ApiError,
} from '@aivox/sdk';

try {
  const audio = await client.tts.synthesize('你好');
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.error('余额不足，请充值');
  } else if (err instanceof RateLimitedError) {
    console.error(`请求过频，请 ${err.retryAfter}s 后重试`);
  } else if (err instanceof AuthenticationError) {
    console.error('认证失败，token 已过期');
  } else if (err instanceof ApiError) {
    console.error(`API 错误 ${err.statusCode}: ${err.message}`);
  }
}
```

---

## Token 自动刷新

SDK 在每次请求前检查 token 是否即将过期（默认提前 30 秒刷新），并通过互斥锁防止并发请求重复刷新。

```typescript
const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  tokenProvider: async () => { /* ... */ },
  refreshThresholdSeconds: 60, // 提前 60 秒刷新（默认 30）
});
```

收到 401 响应时，SDK 会自动清除缓存并重试一次。

---

## Node.js 环境

Node.js 18+ 原生支持 `fetch`，无需额外配置。18 以下需传入自定义 fetch：

```typescript
import fetch from 'node-fetch';

const client = createAiVoxClient({
  baseUrl: 'https://api.aivox.com',
  tokenProvider: async () => { /* ... */ },
  fetch: fetch as typeof globalThis.fetch,
});
```

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

# @audarai/sdk

<div align="center">

**The official JavaScript / TypeScript SDK for the AudarAI platform**

*Build voice-enabled applications with Text-to-Speech, Speech-to-Text, real-time translation, and AI agent orchestration — all in one SDK.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [العربية](./README.ar.md)

</div>

---

## Overview

`@audarai/sdk` is the official client library for the **AudarAI** platform — a production-grade audio AI infrastructure supporting:

- **Text-to-Speech (TTS)** — high-quality voice synthesis with custom speaker cloning
- **Speech-to-Text (STT)** — accurate transcription via file upload, SSE streaming, or real-time WebSocket
- **Audio Translation** — end-to-end STT → Translation → TTS pipeline with live streaming
- **AI Agent Orchestration** — create, manage, and converse with voice-enabled AI agents
- **Knowledge Bases** — semantic vector search for grounding your agents in domain knowledge
- **Tools & Skills** — extend agent capabilities with HTTP tools, builtins, MCP, and prompt skills
- **Rooms & Sessions** — multi-agent voice rooms with LiveKit integration

Designed for both **browser** and **Node.js (18+)** environments with first-class TypeScript support.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Text-to-Speech (TTS)](#text-to-speech-tts)
- [Speech-to-Text (STT)](#speech-to-text-stt)
- [Audio Translation](#audio-translation)
- [Agent Management](#agent-management)
- [Knowledge Base](#knowledge-base)
- [Tools](#tools)
- [Skills](#skills)
- [Archetypes](#archetypes)
- [Rooms](#rooms)
- [Sessions](#sessions)
- [Error Handling](#error-handling)
- [Token Auto-Refresh](#token-auto-refresh)
- [Node.js Compatibility](#nodejs-compatibility)
- [TypeScript Support](#typescript-support)
- [Demo Application](#demo-application)

---

## Installation

### From GitHub (Recommended)

```bash
# npm
npm install @audarai/sdk@github:AudarAI/webapp-jssdk

# pnpm
pnpm add @audarai/sdk@github:AudarAI/webapp-jssdk

# yarn
yarn add @audarai/sdk@github:AudarAI/webapp-jssdk
```

Or pin it in `package.json`:

```json
{
  "dependencies": {
    "@audarai/sdk": "github:AudarAI/webapp-jssdk"
  }
}
```

### From Local Path

```bash
npm install /path/to/webapp-jssdk
```

---

## Quick Start

```typescript
import { createAudaraiClient } from '@audarai/sdk';

// 1. Create a client
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  publishableKey: 'pk_your_key_here',
});

// 2. Synthesize speech
const audioBuffer = await client.tts.synthesize('Hello, world!', {
  voice: 'en-US-female',
  model: 'tts-1-hd',
  response_format: 'mp3',
});

// 3. Play in the browser
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
const url = URL.createObjectURL(blob);
new Audio(url).play();
```

---

## Authentication

The SDK supports four mutually exclusive authentication modes. Choose exactly one.

| Mode | Field | HTTP Requests | WebSocket |
|---|---|---|---|
| Publishable Key | `publishableKey` | Auto-exchanged session token | Session token |
| Access Token | `accessToken` | JWT passed directly | Auto-exchanged session token |
| API Key | `apiKey` | API key passed directly | Auto-exchanged session token |
| App | `appId` (+ `appSecret`) | appid → session token; appid+secret → HTTP Basic | Auto-exchanged session token |

> WebSocket endpoints only accept short-lived session tokens (`stk_` prefix). The SDK handles the exchange automatically before establishing any connection — no manual handling required.

### Mode 1: Publishable Key (Frontend — safe to embed)

`pk_` keys are safe to include in client-side code. The server validates the request `Origin` against your configured allowlist.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  publishableKey: 'pk_xxx',
});
```

> Before using this mode, create a publishable key in the dashboard and configure allowed origins:
> ```http
> POST /v1/account/api-keys
> { "name": "Web App", "key_type": "publishable", "allowed_origins": ["https://yourapp.com"] }
> ```

### Mode 2: Access Token (SSO / OAuth2)

For applications already using Keycloak or another OAuth2 provider. HTTP requests carry the JWT directly; WebSocket connections auto-exchange for a session token.

```typescript
// Static string
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  accessToken: 'eyJhbGciOiJSUzI1NiJ9...',
});

// Dynamic function (recommended — supports token refresh)
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  accessToken: async () => keycloakAdapter.token,
});
```

### Mode 3: API Key (Backend / Server-side)

`ak_` keys carry full permissions. **Never expose them in browser code.** Use this mode in Node.js services or local development.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  apiKey: 'ak_xxx',
});
```

### Mode 4: App (appid + secret) — one registration for frontend *and* backend

Register an **App** once to get a pair of credentials:
- **`appId`** (`appid_` prefix) — public, frontend uses it alone (safe to embed; restricted by the App's Allowed Origins).
- **`appSecret`** (`secret_` prefix) — confidential, backend uses it together with `appId`. **Never expose in browser code.**

```typescript
// Frontend — appid only (browser-safe; behaves like a publishable key)
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  appId: 'appid_xxx',
});

// Backend — appid + secret (authenticates via HTTP Basic base64(appid:secret))
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  appId: 'appid_xxx',
  appSecret: 'secret_xxx',
});
```

> Create an App in the dashboard, or:
> ```http
> POST /v1/account/apps
> { "name": "My App", "allowed_origins": ["https://yourapp.com"] }
> → { "app_id": "appid_xxx", "secret": "secret_xxx" }   // secret shown once
> ```
> The `secret` is shown only once. Lost it? Reset via `POST /v1/account/apps/{id}/reset-secret` (the old secret is invalidated immediately; `appId` stays the same).

---

## Text-to-Speech (TTS)

### List Available Models

```typescript
const models = await client.tts.listModels();
// → [{ name: 'tts-flash', display_name: 'TTS Flash', kind: 'tts', is_default: false }, ...]

// Use the default for new sessions; let users override via UI
const defaultModel = models.find((m) => m.is_default)?.name;
```

### Synthesize Audio

```typescript
const audioBuffer = await client.tts.synthesize('Hello, world!', {
  voice: 'en-US-female',
  model: 'tts-1-hd',        // 'tts-1' | 'tts-1-hd' (default: 'tts-1')
  response_format: 'mp3',    // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed: 1.0,                // 0.25 – 4.0
  provider: 'flash',         // 'flash' | 'turbo' | 'pro'
});

// Play in browser
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
new Audio(URL.createObjectURL(blob)).play();
```

### Streaming Synthesis

Receive audio as a stream — ideal for long-form content or low-latency playback.

```typescript
const response = await client.tts.synthesizeStream('Long form content...', {
  voice: 'en-US-female',
  response_format: 'mp3',
});

// Pipe to file (Node.js)
import { createWriteStream } from 'fs';
const writer = createWriteStream('output.mp3');
response.body!.pipeTo(
  new WritableStream({ write: (chunk) => writer.write(chunk) })
);
```

### Custom Speaker Management

```typescript
// List available voices
const voices: string[] = await client.tts.listSpeakers();

// Clone a voice from an audio sample
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.tts.addSpeaker('my-voice', file, 'This is the transcript of the recording.', {
  description: 'Custom voice description',
});

// Remove a custom voice
await client.tts.deleteSpeaker('my-voice');
```

---

## Speech-to-Text (STT)

### List Available Models

```typescript
const models = await client.stt.listModels();
// → [{ name: 'stt-flash', display_name: 'STT Flash', kind: 'stt', is_default: false }, ...]

const defaultModel = models.find((m) => m.is_default)?.name;
```

### Transcribe an Audio File

```typescript
const result = await client.stt.transcribe(audioBlob, {
  language: 'en',
  forced_alignment: false,  // Enable word-level timestamps
  provider: 'flash',        // 'flash' | 'turbo'
});

console.log(result.text);        // Transcribed text
console.log(result.language);    // Detected language code
console.log(result.timestamps);  // Word-level timestamps (if forced_alignment: true)
```

### Streaming Transcription (SSE)

Receive incremental transcription results as the server processes your audio.

```typescript
const result = await client.stt.transcribeStream(
  audioBlob,
  { language: 'en', provider: 'flash' },
  {
    onChunk: (chunk) => console.log('Partial:', chunk.text, 'index:', chunk.chunk_index),
    onFinal: (chunk) => console.log('Final:', chunk.text),
    onError: (err)  => console.error('Error:', err),
  },
);

console.log(result.text);      // Full transcription
console.log(result.language);  // Detected language
```

### Upload Size — Automatic Downscaling

Both `transcribe` and `transcribeStream` downscale the audio to **16kHz mono**
before uploading. The backend converts to 16kHz mono regardless, so this does not
change the transcription — it just stops you from sending bytes that are about to
be discarded. A 44.1kHz stereo source shrinks ~5.5x.

This matters because a CDN sits in front of the API and rejects request bodies
over its per-plan cap (100MB on Cloudflare Free/Pro) at the edge, with a
`413 Content Too Large` the server never sees. In terms of what fits in 100MB:

| Uploaded as | Bitrate | Fits in 100MB |
|---|---|---|
| 44.1kHz stereo 16-bit WAV | 176 KB/s | ~9.5 min |
| 16kHz mono 16-bit WAV (what the SDK sends) | 32 KB/s | ~52 min |

```typescript
// Default: convert only when it is likely to matter (files over 4MiB).
await client.stt.transcribeStream(audioBlob, { language: 'en' });

// Always convert, whatever the size.
await client.stt.transcribe(audioBlob, { preprocess: 'always' });

// Send the exact bytes you passed in.
await client.stt.transcribe(audioBlob, { preprocess: 'never' });

// Tune the threshold, or the target rate.
await client.stt.transcribe(audioBlob, {
  preprocess: 'auto',
  transcode: { minBytes: 512 * 1024, sampleRate: 16000 },
});
```

Conversion is skipped automatically — and the original bytes uploaded unchanged —
when any of these hold, so you never need to branch on environment or format:

- there is no Web Audio implementation (Node, or a very old browser);
- the file is under `transcode.minBytes` and `preprocess` is `'auto'`;
- the source is already compressed tightly enough that PCM would be **larger**
  (an MP3 or Opus file, typically);
- the container cannot be decoded, or decoding fails.

You can run the conversion yourself, e.g. to show the saving before uploading:

```typescript
import { preprocessForAsr } from '@audarai/sdk';

const { data, applied, reason, originalBytes, bytes } = await preprocessForAsr(file, 'always');
console.log(applied ? `${originalBytes} → ${bytes} bytes` : `skipped: ${reason}`);
```

**Beyond ~52 minutes** of audio, downscaling alone is not enough for the edge
cap. Use the presigned direct-to-S3 upload instead: `POST
/v1/speech/audio/uploads` returns an `upload_id` plus a URL to `PUT` the bytes
straight to S3, and the transcription endpoints accept that `upload_id` in place
of the file. The two compose — downscale first, then upload the smaller result.

> **Not yet implemented:** FLAC / Opus output, which would shrink another 2–8x.
> Browsers ship no native encoder for either, so it needs a wasm codec or a
> hand-written Ogg muxer over WebCodecs; this SDK has no runtime dependencies and
> that is worth keeping. 16kHz mono WAV captures most of the win with universal
> support. If your audio is long enough for the difference to matter, encode to
> Opus yourself before calling the SDK and pass `preprocess: 'never'`.

### Real-time Transcription (WebSocket)

For live microphone input with sub-second latency.

```typescript
const stt = await client.stt.connectWebSocket(
  { language: 'en', provider: 'flash' },
  {
    onReady:   ({ session_id }) => console.log('Session ready:', session_id),
    onPartial: ({ text })       => console.log('Live:', text),
    onSegment: ({ text, segment_index }) => console.log(`Segment ${segment_index}:`, text),
    onFinal:   ({ text })       => console.log('Final:', text),
    onError:   (e)              => console.error('Error:', e),
    onClose:   ()               => console.log('Connection closed'),
  },
);

// Send raw PCM audio frames (ArrayBuffer or Int16Array)
stt.sendAudio(pcmBuffer);

// Signal end of stream — server flushes and closes
stt.stop();
```

---

## Audio Translation

### File Translation (SSE Pipeline)

`translate()` pushes events for each pipeline stage: **STT → Translation → TTS**. The method resolves with the final result.

```typescript
const result = await client.translation.translate(
  audioBlob,
  {
    target_lang: 'en',
    source_lang: 'zh',           // Optional — auto-detected if omitted
    translation_mode: 'llm',     // 'llm' (default) | 'mt' (machine translation)
    tts_enabled: true,
    response_format: 'mp3',
    voice: 'en-US-female',
  },
  {
    onStatus:              ({ stage, message }) => console.log(stage, message),
    onSttPartial:          ({ text })           => showSubtitle(text),
    onSttFinal:            ({ text })           => console.log('STT:', text),
    onTranslationPartial:  ({ text })           => showTranslation(text),
    onTranslationComplete: ({ text })           => console.log('Translation:', text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onTtsComplete:         ({ total_chunks })   => console.log('TTS complete'),
    onPipelineComplete:    ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onError:               ({ stage, message }) => console.error(stage, message),
  },
);

console.log(result.source_text);  // Original text
console.log(result.text);         // Translated text
```

### Real-time Translation (WebSocket)

End-to-end live translation from microphone input.

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
    onReady:               ({ session_id }) => console.log('Session:', session_id),
    onSttPartial:          ({ text })       => showSubtitle(text),
    onSttSegment:          ({ text, segment_index }) => console.log('Segment:', text),
    onTranslationComplete: ({ text, target_lang })   => showTranslation(text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onSegmentComplete:     ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onPipelineComplete:    ({ duration }) => console.log(`Done in ${duration}s`),
    onError:               ({ message, stage }) => console.error(stage, message),
    onClose:               () => console.log('Disconnected'),
  },
);

// Send raw PCM frames from microphone
ws.sendAudio(pcmBuffer);

// End the session
ws.stop();
```

---

## Agent Management

### Create and Manage Agents

```typescript
// List agents for the current tenant
const agents = await client.agent.listAgents();

// List platform-wide agents (visible to all authenticated users)
const platformAgents = await client.agent.listPlatformAgents();

// Create an agent
const agent = await client.agent.createAgent({
  name: 'Support Assistant',
  description: 'Voice-enabled customer support agent',
  system_prompt: 'You are a professional support agent. Be concise and helpful.',
  voice_id: 'en-US-female',
  language: 'en',
  archetype_id: 'archetype-uuid',          // Optional
  knowledge_bindings: ['kb-uuid'],         // Attach knowledge bases
  skills: ['skill-uuid'],                  // Attach skills
  memory_policy: {
    enable_memory: true,
    num_history_turns: 10,
  },
});

// Get / Update / Delete
const detail  = await client.agent.getAgent(agent.id);
await client.agent.updateAgent(agent.id, { name: 'Updated Name' });
await client.agent.deleteAgent(agent.id);
```

### Start a Conversation

`chat()` creates a session and returns `{ session_id, room_id }`. Use `getLiveKitToken()` to join the voice room.

```typescript
const { session_id } = await client.agent.chat(agentId, 'Hello!', {
  voice_id: 'en-US-female',  // Optional — overrides the agent default
});

// Retrieve a LiveKit token for voice connectivity
const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);

// Connect with the official LiveKit client
import { Room } from '@livekit/client';
const room = new Room();
await room.connect(livekit_url, token);
```

---

## Knowledge Base

### Create and Manage Knowledge Bases

```typescript
const kbs = await client.knowledge.list();

const kb = await client.knowledge.create({
  name: 'Product Manual',
  description: 'Product FAQs and operating instructions',
});

await client.knowledge.update(kb.id, { name: 'Product Manual v2' });
await client.knowledge.delete(kb.id);
```

### Ingest Content

```typescript
// Ingest plain text (asynchronous — returns 202 Accepted)
await client.knowledge.ingest(kb.id, {
  source_type: 'text',
  text: 'The content to be embedded and indexed...',
  source_label: 'Manual entry',
  language: 'en',
});

// Ingest from a URL
await client.knowledge.ingest(kb.id, {
  source_type: 'url',
  url: 'https://example.com/docs/api',
});

// Upload a file
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.knowledge.ingestFile(kb.id, file, file.name);
```

### Semantic Search

```typescript
const results = await client.knowledge.search(kb.id, {
  query: 'How do I reset my password?',
  top_k: 5,       // Number of results (default: 5)
  language: 'en',
});

results.forEach(r => {
  console.log(`[${r.score.toFixed(3)}] ${r.content}`);
});
```

### Document Management

```typescript
const docs = await client.knowledge.listDocuments(kb.id);
await client.knowledge.deleteDocument(kb.id, docId);

// Trigger re-ingestion of all documents
await client.knowledge.reingest(kb.id);
```

---

## Tools

Extend your agents with external capabilities: HTTP APIs, built-in tools (web search), and MCP servers.

### Create Tools

```typescript
// HTTP tool — call any REST API
const httpTool = await client.tool.create({
  name: 'Weather API',
  tool_type: 'http',
  config: {
    url: 'https://api.weather.com/v1/current',
    method: 'GET',
    headers: { 'X-API-Key': 'xxx' },
  },
});

// Built-in tool (e.g., web search)
const searchTool = await client.tool.create({
  name: 'Web Search',
  tool_type: 'builtin',
  config: { toolkit: 'web_search' },
});

// MCP tool (SSE transport)
const mcpTool = await client.tool.create({
  name: 'MCP Tool',
  tool_type: 'mcp',
  config: {
    transport: 'sse',
    server_url: 'https://mcp.example.com/sse',
  },
});

await client.tool.update(httpTool.id, { name: 'Weather API v2' });
await client.tool.delete(httpTool.id);
```

### List Available Built-ins

```typescript
const builtins = await client.tool.listBuiltins();
builtins.forEach(b => console.log(`${b.toolkit} — ${b.description}`));
```

---

## Skills

Skills are Markdown snippets injected into an agent's system prompt. Use them to extend or specialize agent behavior without changing the base prompt.

```typescript
const skills = await client.skill.list();

const skill = await client.skill.create({
  name: 'Formal Language',
  description: 'Instructs the agent to always use formal language',
  content: `## Tone Guidelines\n- Always address the user formally\n- End each response with "Is there anything else I can help you with?"`,
});

await client.skill.update(skill.id, { content: 'Updated skill content...' });
await client.skill.delete(skill.id);
```

---

## Archetypes

Archetypes are reusable base configurations — combining a base system prompt with a default set of skills. Assign an archetype to multiple agents to ensure consistent behavior.

```typescript
const archetypes = await client.archetype.list();

const arch = await client.archetype.create({
  name: 'Support Agent Template',
  description: 'Base configuration for all support agents',
  base_prompt: 'You are a professional support agent...',
});

await client.archetype.update(arch.id, { base_prompt: 'Updated base prompt...' });
await client.archetype.delete(arch.id);
```

---

## Rooms

Rooms are persistent containers for multi-turn voice sessions. A room can host multiple agents and multiple concurrent sessions.

### Create and Manage Rooms

```typescript
const rooms = await client.agent.rooms.list();

const room = await client.agent.rooms.create({
  name: 'Support Lobby',
  description: 'Real-time voice support room',
  talking_style: 'sequential',   // 'sequential' | 'moderator_led' | 'freeform'
  visibility: 'private',         // 'private' | 'shared' | 'public'
  agent_ids: [agentId],
});

await client.agent.rooms.update(room.id, { name: 'Updated Name' });
await client.agent.rooms.delete(room.id);
```

### Manage Room Agents

```typescript
const { agent_ids } = await client.agent.rooms.listAgents(room.id);

await client.agent.rooms.addAgent(room.id, agentId);
await client.agent.rooms.removeAgent(room.id, agentId);
```

### Start Sessions in a Room

```typescript
// Start a new session
const session = await client.agent.rooms.startSession(room.id, {
  voice_id: 'en-US-female',  // Optional — overrides agent default
});

// List all sessions in a room
const sessions = await client.agent.rooms.listSessions(room.id);
```

---

## Sessions

### Lifecycle Management

```typescript
// List sessions (with pagination and status filtering)
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

### Message History

```typescript
// Retrieve conversation history
const { data: messages } = await client.agent.sessions.listMessages(sessionId, {
  page: 1,
  page_size: 50,
});

// Inject a message into the session
await client.agent.sessions.appendMessage(sessionId, {
  role: 'user',
  content: 'Please check my order status.',
  speaker_type: 'user',
  speaker_ref_id: 'user-uuid',
});
```

### Voice Access via LiveKit

```typescript
// Get a token for the first participant
const { token, livekit_url, room_name } = await client.agent.sessions.getLiveKitToken(sessionId, {
  user_id: 'end-user-123',
  user_name: 'Alice',
});

// Join as an additional participant
const { token, livekit_url } = await client.agent.sessions.join(sessionId, {
  user_id: 'end-user-456',
});

// Connect with @livekit/client
import { Room } from '@livekit/client';
const livekitRoom = new Room();
await livekitRoom.connect(livekit_url, token);
```

### Participant Context

Override per-participant configuration at runtime.

```typescript
await client.agent.sessions.upsertParticipantContext(sessionId, 'user-ref-id', {
  custom_prompt: 'Respond only in Spanish.',
  variables: { userName: 'Carlos' },
});

await client.agent.sessions.deleteParticipantContext(sessionId, 'user-ref-id');
```

---

## Error Handling

The SDK exports typed error classes for every failure mode.

```typescript
import {
  AudaraiError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
  ApiError,
} from '@audarai/sdk';

try {
  const audio = await client.tts.synthesize('Hello');
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Invalid or expired credentials
    console.error('Authentication failed — check your credentials.');
  } else if (err instanceof InsufficientBalanceError) {
    // HTTP 402 — account balance depleted
    console.error('Insufficient balance — please top up your account.');
  } else if (err instanceof RateLimitedError) {
    // HTTP 429 — too many requests
    console.error(`Rate limited — retry after ${err.retryAfter}s`);
  } else if (err instanceof ApiError) {
    // Any other HTTP error
    console.error(`API error ${err.statusCode}: ${err.message}`);
  }
}
```

---

## Token Auto-Refresh

The SDK proactively refreshes session tokens before they expire (default: 30 seconds before expiry). A mutex prevents redundant concurrent refresh calls. If a `401` response is received, the SDK clears the cached token and retries the request once automatically.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  publishableKey: 'pk_xxx',
  refreshThresholdSeconds: 60,  // Refresh 60s before expiry (default: 30)
});
```

---

## Node.js Compatibility

Node.js 18+ includes native `fetch` — no extra configuration needed.

For **Node.js < 18**, pass a custom `fetch` implementation:

```typescript
import fetch from 'node-fetch';

const client = createAudaraiClient({
  baseUrl: 'https://prod.audarai.com/apiv2',
  apiKey: 'ak_xxx',
  fetch: fetch as typeof globalThis.fetch,
});
```

---

## TypeScript Support

The SDK is written in TypeScript and ships full type declarations out of the box. Every request option, response shape, and callback signature is typed.

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

## Demo Application

A full-featured Vue 3 + Vite demo app is included under the `demo/` directory. It provides an interactive UI for every SDK feature, including real-time microphone recording, log viewing, and LiveKit voice sessions.

```bash
cd demo
npm install
npm run dev
```

Open `http://localhost:5173` and enter your credentials to explore all capabilities interactively.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

<div align="center">
Built with care by the <strong>AudarAI</strong> team.<br/>
Questions? Open an issue or visit <a href="https://audarai.com">audarai.com</a>.
</div>

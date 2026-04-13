<div dir="rtl">

# @audarai/sdk

<div align="center">

**مجموعة تطوير البرامج الرسمية لمنصة AudarAI — JavaScript / TypeScript**

*بناء تطبيقات صوتية متكاملة: تحويل النص إلى كلام، والكلام إلى نص، والترجمة الفورية، وتنسيق وكلاء الذكاء الاصطناعي — كل ذلك في مجموعة تطوير واحدة.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [العربية](./README.ar.md)

</div>

---

## نظرة عامة

`@audarai/sdk` هي مكتبة العميل الرسمية لمنصة **AudarAI** — بنية تحتية متكاملة للذكاء الاصطناعي الصوتي تشمل:

- **تحويل النص إلى كلام (TTS)** — توليف صوتي عالي الجودة مع إمكانية استنساخ أصوات مخصصة
- **تحويل الكلام إلى نص (STT)** — نسخ دقيق عبر رفع الملفات، أو البث عبر SSE، أو WebSocket في الوقت الفعلي
- **ترجمة الصوت** — خط أنابيب متكامل من STT → الترجمة → TTS مع بث فوري
- **تنسيق وكلاء الذكاء الاصطناعي** — إنشاء وإدارة والتفاعل مع وكلاء ذكاء اصطناعي صوتيين
- **قواعد المعرفة** — بحث دلالي بالمتجهات لتزويد الوكلاء بالمعرفة التخصصية
- **الأدوات والمهارات** — توسيع قدرات الوكيل عبر أدوات HTTP ومدمجة وMCP ومهارات المطالبة
- **الغرف والجلسات** — غرف صوتية متعددة الوكلاء مع تكامل LiveKit

مصمم لبيئتَي **المتصفح** و**Node.js (الإصدار 18 وما فوق)** مع دعم كامل لـ TypeScript.

---

## جدول المحتويات

- [التثبيت](#التثبيت)
- [البدء السريع](#البدء-السريع)
- [المصادقة](#المصادقة)
- [تحويل النص إلى كلام (TTS)](#تحويل-النص-إلى-كلام-tts)
- [تحويل الكلام إلى نص (STT)](#تحويل-الكلام-إلى-نص-stt)
- [ترجمة الصوت](#ترجمة-الصوت)
- [إدارة الوكلاء](#إدارة-الوكلاء)
- [قاعدة المعرفة](#قاعدة-المعرفة)
- [الأدوات](#الأدوات)
- [المهارات](#المهارات)
- [النماذج الأصلية](#النماذج-الأصلية)
- [الغرف](#الغرف)
- [الجلسات](#الجلسات)
- [معالجة الأخطاء](#معالجة-الأخطاء)
- [التجديد التلقائي للرمز المميز](#التجديد-التلقائي-للرمز-المميز)
- [التوافق مع Node.js](#التوافق-مع-nodejs)
- [دعم TypeScript](#دعم-typescript)
- [تطبيق العرض التوضيحي](#تطبيق-العرض-التوضيحي)

---

## التثبيت

### التثبيت من GitHub (موصى به)

```bash
# npm
npm install @audarai/sdk@github:AudarAI/webapp-jssdk

# pnpm
pnpm add @audarai/sdk@github:AudarAI/webapp-jssdk

# yarn
yarn add @audarai/sdk@github:AudarAI/webapp-jssdk
```

أو تحديده في `package.json`:

```json
{
  "dependencies": {
    "@audarai/sdk": "github:AudarAI/webapp-jssdk"
  }
}
```

### التثبيت من مسار محلي

```bash
npm install /path/to/webapp-jssdk
```

---

## البدء السريع

```typescript
import { createAudaraiClient } from '@audarai/sdk';

// 1. إنشاء العميل
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_your_key_here',
});

// 2. توليف الكلام
const audioBuffer = await client.tts.synthesize('مرحباً بالعالم!', {
  voice: 'ar-SA-female',
  model: 'tts-1-hd',
  response_format: 'mp3',
});

// 3. التشغيل في المتصفح
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
new Audio(URL.createObjectURL(blob)).play();
```

---

## المصادقة

يدعم SDK ثلاثة أنماط مصادقة حصرية. يجب اختيار نمط واحد فقط.

| النمط | الحقل | طلبات HTTP | WebSocket |
|---|---|---|---|
| المفتاح القابل للنشر | `publishableKey` | رمز الجلسة (تلقائي) | رمز الجلسة |
| رمز الوصول | `accessToken` | JWT مباشرة | رمز الجلسة (تلقائي) |
| مفتاح API | `apiKey` | مفتاح API مباشرة | رمز الجلسة (تلقائي) |

> تقبل نقاط نهاية WebSocket فقط رموز الجلسة قصيرة الأجل (بادئة `stk_`). يتولى SDK التبادل تلقائياً قبل إنشاء أي اتصال — دون الحاجة لأي معالجة يدوية.

### النمط الأول: publishableKey (للواجهة الأمامية — آمن للتضمين)

مفاتيح `pk_` آمنة للتضمين في الكود الجانبي للعميل. يتحقق الخادم من أن `Origin` الطلب مدرج في القائمة البيضاء.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_xxx',
});
```

> قبل استخدام هذا النمط، أنشئ مفتاحاً قابلاً للنشر في لوحة التحكم وهيئ المصادر المسموح بها:
> ```http
> POST /v1/account/api-keys
> { "name": "Web App", "key_type": "publishable", "allowed_origins": ["https://yourapp.com"] }
> ```

### النمط الثاني: accessToken (SSO / OAuth2)

للتطبيقات التي تستخدم Keycloak أو موفر OAuth2 آخر. تحمل طلبات HTTP الـ JWT مباشرةً؛ تُبادَل اتصالات WebSocket تلقائياً للحصول على رمز الجلسة.

```typescript
// سلسلة ثابتة
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  accessToken: 'eyJhbGciOiJSUzI1NiJ9...',
});

// دالة ديناميكية (موصى به — يدعم تجديد الرمز)
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  accessToken: async () => keycloakAdapter.token,
});
```

### النمط الثالث: apiKey (للخادم / خلف الكواليس)

تمتلك مفاتيح `ak_` صلاحيات كاملة. **لا تكشفها أبداً في كود المتصفح.** استخدم هذا النمط في خدمات Node.js أو بيئة التطوير المحلية.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  apiKey: 'ak_xxx',
});
```

---

## تحويل النص إلى كلام (TTS)

### توليف الصوت

```typescript
const audioBuffer = await client.tts.synthesize('مرحباً بالعالم!', {
  voice: 'ar-SA-female',
  model: 'tts-1-hd',        // 'tts-1' | 'tts-1-hd' (الافتراضي: 'tts-1')
  response_format: 'mp3',    // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed: 1.0,                // 0.25 – 4.0
  provider: 'flash',         // 'flash' | 'turbo' | 'pro'
});

// التشغيل في المتصفح
const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
new Audio(URL.createObjectURL(blob)).play();
```

### التوليف المتدفق

مثالي للمحتوى الطويل أو التشغيل بزمن استجابة منخفض.

```typescript
const response = await client.tts.synthesizeStream('محتوى نصي طويل...', {
  voice: 'ar-SA-female',
  response_format: 'mp3',
});

// الكتابة إلى ملف (Node.js)
import { createWriteStream } from 'fs';
const writer = createWriteStream('output.mp3');
response.body!.pipeTo(
  new WritableStream({ write: (chunk) => writer.write(chunk) })
);
```

### إدارة الأصوات المخصصة

```typescript
// عرض الأصوات المتاحة
const voices: string[] = await client.tts.listSpeakers();

// استنساخ صوت من عينة صوتية
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.tts.addSpeaker('my-voice', file, 'هذا نص التسجيل الصوتي.', {
  description: 'وصف الصوت المخصص',
});

// حذف صوت مخصص
await client.tts.deleteSpeaker('my-voice');
```

---

## تحويل الكلام إلى نص (STT)

### نسخ ملف صوتي

```typescript
const result = await client.stt.transcribe(audioBlob, {
  language: 'ar',
  forced_alignment: false,  // تفعيل الطوابع الزمنية على مستوى الكلمة
  provider: 'flash',        // 'flash' | 'turbo'
});

console.log(result.text);        // النص المنسوخ
console.log(result.language);    // رمز اللغة المُكتشَفة
console.log(result.timestamps);  // طوابع زمنية على مستوى الكلمة (عند تفعيل forced_alignment)
```

### النسخ المتدفق (SSE)

استقبال نتائج النسخ التدريجية أثناء معالجة الخادم للصوت.

```typescript
const result = await client.stt.transcribeStream(
  audioBlob,
  { language: 'ar', provider: 'flash' },
  {
    onChunk: (chunk) => console.log('جزئي:', chunk.text, 'الفهرس:', chunk.chunk_index),
    onFinal: (chunk) => console.log('نهائي:', chunk.text),
    onError: (err)  => console.error('خطأ:', err),
  },
);

console.log(result.text);      // النص الكامل المنسوخ
console.log(result.language);  // اللغة المُكتشَفة
```

### النسخ في الوقت الفعلي (WebSocket)

لإدخال الميكروفون المباشر بزمن استجابة أقل من ثانية.

```typescript
const stt = await client.stt.connectWebSocket(
  { language: 'ar', provider: 'flash' },
  {
    onReady:   ({ session_id }) => console.log('الجلسة جاهزة:', session_id),
    onPartial: ({ text })       => console.log('مباشر:', text),
    onSegment: ({ text, segment_index }) => console.log(`المقطع ${segment_index}:`, text),
    onFinal:   ({ text })       => console.log('نهائي:', text),
    onError:   (e)              => console.error('خطأ:', e),
    onClose:   ()               => console.log('تم إغلاق الاتصال'),
  },
);

// إرسال إطارات PCM الخام (ArrayBuffer أو Int16Array)
stt.sendAudio(pcmBuffer);

// إشارة نهاية البث — يقوم الخادم بالتدفق والإغلاق
stt.stop();
```

---

## ترجمة الصوت

### ترجمة الملف (خط أنابيب SSE)

يُرسل `translate()` أحداثاً لكل مرحلة من مراحل خط الأنابيب: **STT → الترجمة → TTS**. يُحلل الأسلوب بالنتيجة النهائية.

```typescript
const result = await client.translation.translate(
  audioBlob,
  {
    target_lang: 'ar',
    source_lang: 'en',            // اختياري — يُكتشَف تلقائياً إذا لم يُحدَّد
    translation_mode: 'llm',      // 'llm' (الافتراضي) | 'mt' (الترجمة الآلية)
    tts_enabled: true,
    response_format: 'mp3',
    voice: 'ar-SA-female',
  },
  {
    onStatus:              ({ stage, message }) => console.log(stage, message),
    onSttPartial:          ({ text })           => showSubtitle(text),
    onSttFinal:            ({ text })           => console.log('STT:', text),
    onTranslationPartial:  ({ text })           => showTranslation(text),
    onTranslationComplete: ({ text })           => console.log('الترجمة:', text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onTtsComplete:         ({ total_chunks })   => console.log('اكتمل TTS'),
    onPipelineComplete:    ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onError:               ({ stage, message }) => console.error(stage, message),
  },
);

console.log(result.source_text);  // النص الأصلي
console.log(result.text);         // النص المترجم
```

### الترجمة في الوقت الفعلي (WebSocket)

ترجمة مباشرة من الميكروفون من طرف إلى طرف.

```typescript
const ws = await client.translation.connectWebSocket(
  {
    target_lang: 'ar',
    source_lang: 'en',
    tts_enabled: true,
    translation_mode: 'llm',
    response_format: 'mp3',
  },
  {
    onReady:               ({ session_id }) => console.log('الجلسة:', session_id),
    onSttPartial:          ({ text })       => showSubtitle(text),
    onSttSegment:          ({ text, segment_index }) => console.log('المقطع:', text),
    onTranslationComplete: ({ text, target_lang })   => showTranslation(text),
    onTtsChunk:            (audio, { format, sample_rate }) => playAudio(audio),
    onSegmentComplete:     ({ source_text, translated_text }) =>
      console.log(`${source_text} → ${translated_text}`),
    onPipelineComplete:    ({ duration }) => console.log(`اكتمل في ${duration} ثانية`),
    onError:               ({ message, stage }) => console.error(stage, message),
    onClose:               () => console.log('تم قطع الاتصال'),
  },
);

// إرسال إطارات PCM الخام من الميكروفون
ws.sendAudio(pcmBuffer);

// إنهاء الجلسة
ws.stop();
```

---

## إدارة الوكلاء

### إنشاء الوكلاء وإدارتهم

```typescript
// عرض الوكلاء الخاصين بالمستأجر الحالي
const agents = await client.agent.listAgents();

// عرض الوكلاء على مستوى المنصة (مرئيون لجميع المستخدمين المصادق عليهم)
const platformAgents = await client.agent.listPlatformAgents();

// إنشاء وكيل
const agent = await client.agent.createAgent({
  name: 'مساعد الدعم',
  description: 'وكيل دعم عملاء صوتي',
  system_prompt: 'أنت وكيل دعم احترافي. كن موجزاً ومفيداً.',
  voice_id: 'ar-SA-female',
  language: 'ar',
  archetype_id: 'archetype-uuid',          // اختياري
  knowledge_bindings: ['kb-uuid'],         // ربط قواعد المعرفة
  skills: ['skill-uuid'],                  // ربط المهارات
  memory_policy: {
    enable_memory: true,
    num_history_turns: 10,
  },
});

// الحصول على / تحديث / حذف وكيل
const detail  = await client.agent.getAgent(agent.id);
await client.agent.updateAgent(agent.id, { name: 'اسم محدَّث' });
await client.agent.deleteAgent(agent.id);
```

### بدء محادثة

يُنشئ `chat()` جلسة ويُعيد `{ session_id, room_id }`. استخدم `getLiveKitToken()` للانضمام إلى الغرفة الصوتية.

```typescript
const { session_id } = await client.agent.chat(agentId, 'مرحباً!', {
  voice_id: 'ar-SA-female',  // اختياري — يُجاوز الصوت الافتراضي للوكيل
});

// استرداد رمز LiveKit للاتصال الصوتي
const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);

// الاتصال باستخدام مكتبة @livekit/client الرسمية
import { Room } from '@livekit/client';
const room = new Room();
await room.connect(livekit_url, token);
```

---

## قاعدة المعرفة

### إنشاء قواعد المعرفة وإدارتها

```typescript
const kbs = await client.knowledge.list();

const kb = await client.knowledge.create({
  name: 'دليل المنتج',
  description: 'الأسئلة الشائعة وتعليمات التشغيل',
});

await client.knowledge.update(kb.id, { name: 'دليل المنتج v2' });
await client.knowledge.delete(kb.id);
```

### استيعاب المحتوى

```typescript
// استيعاب نص عادي (غير متزامن — يُعيد 202 Accepted)
await client.knowledge.ingest(kb.id, {
  source_type: 'text',
  text: 'المحتوى المراد تضمينه وفهرسته...',
  source_label: 'إدخال يدوي',
  language: 'ar',
});

// الاستيعاب من رابط URL
await client.knowledge.ingest(kb.id, {
  source_type: 'url',
  url: 'https://example.com/docs/api',
});

// رفع ملف
const file = document.querySelector<HTMLInputElement>('input[type=file]')!.files![0];
await client.knowledge.ingestFile(kb.id, file, file.name);
```

### البحث الدلالي

```typescript
const results = await client.knowledge.search(kb.id, {
  query: 'كيف أعيد تعيين كلمة المرور؟',
  top_k: 5,       // عدد النتائج (الافتراضي: 5)
  language: 'ar',
});

results.forEach(r => {
  console.log(`[${r.score.toFixed(3)}] ${r.content}`);
});
```

### إدارة الوثائق

```typescript
const docs = await client.knowledge.listDocuments(kb.id);
await client.knowledge.deleteDocument(kb.id, docId);

// إعادة استيعاب جميع الوثائق
await client.knowledge.reingest(kb.id);
```

---

## الأدوات

وسّع قدرات وكلائك باستخدام واجهات برمجة HTTP الخارجية، والأدوات المدمجة (البحث على الويب)، وخوادم MCP.

### إنشاء الأدوات

```typescript
// أداة HTTP — استدعاء أي واجهة REST
const httpTool = await client.tool.create({
  name: 'واجهة الطقس',
  tool_type: 'http',
  config: {
    url: 'https://api.weather.com/v1/current',
    method: 'GET',
    headers: { 'X-API-Key': 'xxx' },
  },
});

// أداة مدمجة (مثل البحث على الويب)
const searchTool = await client.tool.create({
  name: 'بحث الويب',
  tool_type: 'builtin',
  config: { toolkit: 'web_search' },
});

// أداة MCP (نقل SSE)
const mcpTool = await client.tool.create({
  name: 'أداة MCP',
  tool_type: 'mcp',
  config: {
    transport: 'sse',
    server_url: 'https://mcp.example.com/sse',
  },
});

await client.tool.update(httpTool.id, { name: 'واجهة الطقس v2' });
await client.tool.delete(httpTool.id);
```

### عرض الأدوات المدمجة المتاحة

```typescript
const builtins = await client.tool.listBuiltins();
builtins.forEach(b => console.log(`${b.toolkit} — ${b.description}`));
```

---

## المهارات

المهارات هي مقاطع Markdown تُحقن في system prompt الوكيل. استخدمها لتوسيع سلوك الوكيل أو تخصيصه دون تغيير المطالبة الأساسية.

```typescript
const skills = await client.skill.list();

const skill = await client.skill.create({
  name: 'اللغة الرسمية',
  description: 'يوجّه الوكيل لاستخدام اللغة الرسمية دائماً',
  content: `## إرشادات الأسلوب\n- خاطب المستخدم دائماً بصيغة المفرد المحترم\n- اختم كل رد بـ"هل ثمة شيء آخر يمكنني مساعدتك به؟"`,
});

await client.skill.update(skill.id, { content: 'محتوى المهارة المحدَّث...' });
await client.skill.delete(skill.id);
```

---

## النماذج الأصلية

النماذج الأصلية هي تهيئات أساسية قابلة لإعادة الاستخدام — تجمع بين system prompt أساسي ومجموعة افتراضية من المهارات. خصص نموذجاً أصلياً لوكلاء متعددين لضمان سلوك متسق.

```typescript
const archetypes = await client.archetype.list();

const arch = await client.archetype.create({
  name: 'قالب وكيل الدعم',
  description: 'التهيئة الأساسية لجميع وكلاء الدعم',
  base_prompt: 'أنت وكيل دعم احترافي...',
});

await client.archetype.update(arch.id, { base_prompt: 'مطالبة أساسية محدَّثة...' });
await client.archetype.delete(arch.id);
```

---

## الغرف

الغرف هي حاويات دائمة لجلسات الصوت متعددة الأدوار. يمكن للغرفة استضافة وكلاء متعددين وجلسات متزامنة متعددة.

### إنشاء الغرف وإدارتها

```typescript
const rooms = await client.agent.rooms.list();

const room = await client.agent.rooms.create({
  name: 'صالة الدعم',
  description: 'غرفة دعم صوتي في الوقت الفعلي',
  talking_style: 'sequential',   // 'sequential' | 'moderator_led' | 'freeform'
  visibility: 'private',         // 'private' | 'shared' | 'public'
  agent_ids: [agentId],
});

await client.agent.rooms.update(room.id, { name: 'اسم محدَّث' });
await client.agent.rooms.delete(room.id);
```

### إدارة وكلاء الغرفة

```typescript
const { agent_ids } = await client.agent.rooms.listAgents(room.id);

await client.agent.rooms.addAgent(room.id, agentId);
await client.agent.rooms.removeAgent(room.id, agentId);
```

### بدء الجلسات في غرفة

```typescript
// بدء جلسة جديدة
const session = await client.agent.rooms.startSession(room.id, {
  voice_id: 'ar-SA-female',  // اختياري — يُجاوز الصوت الافتراضي للوكيل
});

// عرض جميع الجلسات في الغرفة
const sessions = await client.agent.rooms.listSessions(room.id);
```

---

## الجلسات

### إدارة دورة الحياة

```typescript
// عرض الجلسات (مع ترقيم الصفحات وتصفية الحالة)
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

### سجل الرسائل

```typescript
// استرداد تاريخ المحادثة
const { data: messages } = await client.agent.sessions.listMessages(sessionId, {
  page: 1,
  page_size: 50,
});

// إضافة رسالة إلى الجلسة
await client.agent.sessions.appendMessage(sessionId, {
  role: 'user',
  content: 'الرجاء التحقق من حالة طلبي.',
  speaker_type: 'user',
  speaker_ref_id: 'user-uuid',
});
```

### الوصول الصوتي عبر LiveKit

```typescript
// الحصول على رمز للمشارك الأول
const { token, livekit_url, room_name } = await client.agent.sessions.getLiveKitToken(sessionId, {
  user_id: 'end-user-123',
  user_name: 'أحمد',
});

// الانضمام كمشارك إضافي
const { token, livekit_url } = await client.agent.sessions.join(sessionId, {
  user_id: 'end-user-456',
});

// الاتصال بـ @livekit/client
import { Room } from '@livekit/client';
const livekitRoom = new Room();
await livekitRoom.connect(livekit_url, token);
```

### سياق المشارك

تجاوز إعدادات المشارك الفردية في وقت التشغيل.

```typescript
await client.agent.sessions.upsertParticipantContext(sessionId, 'user-ref-id', {
  custom_prompt: 'أجب باللغة العربية فقط.',
  variables: { userName: 'محمد' },
});

await client.agent.sessions.deleteParticipantContext(sessionId, 'user-ref-id');
```

---

## معالجة الأخطاء

يُصدر SDK فئات أخطاء مُصنَّفة لكل نمط من أنماط الفشل.

```typescript
import {
  AudaraiError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
  ApiError,
} from '@audarai/sdk';

try {
  const audio = await client.tts.synthesize('مرحباً');
} catch (err) {
  if (err instanceof AuthenticationError) {
    // بيانات اعتماد غير صالحة أو منتهية الصلاحية
    console.error('فشل المصادقة — تحقق من بيانات الاعتماد.');
  } else if (err instanceof InsufficientBalanceError) {
    // HTTP 402 — رصيد الحساب نفد
    console.error('الرصيد غير كافٍ — يرجى شحن الحساب.');
  } else if (err instanceof RateLimitedError) {
    // HTTP 429 — طلبات كثيرة جداً
    console.error(`تجاوز الحد — أعد المحاولة بعد ${err.retryAfter} ثانية`);
  } else if (err instanceof ApiError) {
    // أي خطأ HTTP آخر
    console.error(`خطأ في API ${err.statusCode}: ${err.message}`);
  }
}
```

---

## التجديد التلقائي للرمز المميز

يُجدد SDK رموز الجلسة بشكل استباقي قبل انتهاء صلاحيتها (الافتراضي: 30 ثانية قبل الانتهاء). يمنع mutex تجديد طلبات متزامنة مكررة. عند استقبال استجابة `401`، يمسح SDK الرمز المحفوظ مؤقتاً ويُعيد المحاولة تلقائياً مرة واحدة.

```typescript
const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  publishableKey: 'pk_xxx',
  refreshThresholdSeconds: 60,  // التجديد قبل 60 ثانية (الافتراضي: 30)
});
```

---

## التوافق مع Node.js

يتضمن Node.js 18+ دعماً أصلياً لـ `fetch` — لا حاجة لأي إعداد إضافي.

بالنسبة لـ **Node.js < 18**، مرر تنفيذاً مخصصاً لـ `fetch`:

```typescript
import fetch from 'node-fetch';

const client = createAudaraiClient({
  baseUrl: 'https://api.audarai.com',
  apiKey: 'ak_xxx',
  fetch: fetch as typeof globalThis.fetch,
});
```

---

## دعم TypeScript

كُتب SDK بالكامل بـ TypeScript ويأتي مع إعلانات أنواع كاملة جاهزة للاستخدام. كل خيار طلب وشكل استجابة وتوقيع استدعاء مُعرَّف بدقة.

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

## تطبيق العرض التوضيحي

يتضمن المجلد `demo/` تطبيقاً توضيحياً كاملاً بـ Vue 3 + Vite يوفر واجهة تفاعلية لجميع ميزات SDK، بما فيها التسجيل الصوتي الفوري من الميكروفون، وعرض السجلات، وجلسات الصوت عبر LiveKit.

```bash
cd demo
npm install
npm run dev
```

افتح `http://localhost:5173`، أدخل بيانات الاعتماد الخاصة بك، واستكشف جميع القدرات بشكل تفاعلي.

---

## الترخيص

MIT — راجع [LICENSE](./LICENSE) للتفاصيل.

---

<div align="center">
بُني بعناية من قِبل فريق <strong>AudarAI</strong>.<br/>
هل لديك أسئلة؟ افتح مشكلة أو تفضل بزيارة <a href="https://audarai.com">audarai.com</a>.
</div>

</div>

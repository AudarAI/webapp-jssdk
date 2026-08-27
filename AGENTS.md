# AGENTS.md — `webapp-jssdk` (`@audarai/sdk`)

The official JavaScript/TypeScript client for the **AudarAI** platform. Public repo.
Built with `tsup` → CJS + ESM + `.d.ts`. Browser and Node 18+.

Cross-cutting handoff docs live in the `api-webapp` repo at `docs/handoff/`
(in this workspace: `/workspace/api/docs/handoff/README.md`).

---

## ⚠️ Read this before changing anything

**This SDK is consumed by all five AudarAI web apps, and their production Docker builds
resolve it to this repo's `main` HEAD at build time — not to a version.**

Every frontend `Dockerfile` does `COPY package.json ./` then `npm install`;
`package-lock.json` is never copied into the build stage, and `package.json` pins
`"@audarai/sdk": "github:AudarAI/webapp-jssdk"` with **no ref**.

Therefore: **merging to `main` changes `app.audarai.com`, `account.audarai.com`,
`agent.audarai.com`, `admin.audarai.com` and `audarai.com` on their next build — with no PR,
review or version bump in any of those repos.**

Treat every merge to `main` as a five-app production change. Details and the recommended fix:
`docs/handoff/17-known-issues.md` K-02, and invariant INV-SDK-001.

---

## Structure

```
src/index.ts     public surface
src/client.ts    HTTP client, base URL, auth header handling
src/auth.ts      token handling + auto-refresh
src/errors.ts    typed errors
src/types.ts     shared types

one module per backend domain, mirroring the service surface 1:1:
  account.ts  tenant.ts  app.ts        → account_service   (/v1/account)
  tts.ts  stt.ts  translation.ts  audio.ts  → speech_api   (/v1/speech)
  agent.ts  session.ts  room.ts  knowledge.ts  tool.ts
  skill.ts  archetype.ts  channel.ts  webhook.ts           → agent_api (/v1/agent)
  llm.ts
demo/            demo app (served at jssdk.staging.audarai.com in the dev workspace)
```

## Sources of truth

| Concern | Authority |
|---|---|
| What the API actually does | `api-webapp` — its FastAPI-generated OpenAPI (`GET /v1/<svc>/openapi.json`) |
| Response envelope | `{code, message, data}`, `code == 0` = success (`aivox_common/response.py`) |
| Auth types | `api-webapp/libs/aivox_auth/` — JWT, secret key, publishable key, app, guest, session |
| Consumers | the five web repos' `src/app/api/` |

**Never invent an endpoint.** If it is not in the backend's OpenAPI, it does not exist.

## Development rules

1. **One module per backend domain**, matching the existing naming. Do not create a
   grab-bag module.
2. Keep the public surface additive. A rename or signature change is a breaking change for
   five apps — see the warning above.
3. Types belong in `types.ts` or the owning domain module; do not duplicate backend schemas
   by hand where a generated type would do.
4. `pk_` (publishable) keys are origin-bound and safe in a browser; `sk_` (secret) keys are
   not. Do not add a code path that puts a secret key in browser-reachable code.
5. Keep `README.md`, `README.zh-CN.md` and `README.ar.md` in step — all three are published.
6. Bump `version` in `package.json` when the surface changes, even though consumers do not
   currently read it. It is the only human-readable signal of what changed.

## Verification

```bash
npm install
npm run build      # tsup — must emit cjs, esm and .d.ts cleanly
cd demo && npm install && npx vite build
```

There is **no test suite**. Verify by building, then by exercising the change in `demo/` or
in a consuming app pointed at a local SDK build:

```bash
cd /workspace/jssdk && npm run build
cd /workspace/webapp && npm install /workspace/jssdk && npm run build
```

## Forbidden without explicit human approval

- Merging to `main` (it ships to five production apps — see the warning above).
- Removing or renaming an exported symbol.
- Changing the default base URL or auth header behaviour.
- Committing any API key, token or real credential — including in `demo/` and the READMEs.

## Deeper context

`api-webapp/docs/handoff/` — `07-apis-and-external-services.md` (the contract),
`05-business-invariants.md` (INV-SDK-001/002), `03-repository-map.md`
(`audarai-python-sdk` and `audar-voice-sdk-python` are the Python peers of this SDK).

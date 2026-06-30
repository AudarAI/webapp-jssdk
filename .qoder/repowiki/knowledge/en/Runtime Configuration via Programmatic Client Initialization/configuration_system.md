## Overview

The AudarAI JavaScript SDK monorepo uses a **purely programmatic, constructor-based configuration system** with no static configuration files (no `.env`, `.yaml`, `.toml`, or dotenv integration). All runtime configuration is passed as typed objects to the `createAudaraiClient()` factory function or the `AudaraiClient` constructor.

---

## What System/Approach Is Used

### No Static Config Files

This repository contains **zero** traditional configuration files:
- No `.env*` files
- No `config/` directory
- No YAML/TOML/JSON config loaders
- No environment variable parsing (`process.env` or `import.meta.env` are never used)

### Constructor-Based Configuration Pattern

Configuration is delivered exclusively through TypeScript interfaces passed at instantiation time:

1. **SDK Library** (`src/`): The `AudaraiClientConfig` interface in `src/types.ts` defines all configurable parameters for the client library.
2. **Demo Application** (`demo/`): Configuration is collected via a Vue UI component (`ConnectPanel.vue`) and passed to `createAudaraiClient()`.
3. **RelayAuth**: A separate `RelayAuthConfig` interface in `src/auth.ts` handles OAuth2/Keycloak relay authentication settings.

---

## Key Files and Packages

| File | Role |
|------|------|
| `src/types.ts` | Defines `AudaraiClientConfig` — the core configuration interface with fields: `baseUrl`, `publishableKey`, `accessToken`, `apiKey`, `appId`, `appSecret`, `refreshThresholdSeconds`, `fetch`, `livekitUrl`, `onTokenRefresh` |
| `src/client.ts` | `AudaraiClient` constructor validates and processes config; enforces exactly-one-auth-mode constraint; builds `TokenManager` and `HttpClient` from config |
| `src/auth.ts` | `RelayAuthConfig` interface and `RelayAuth` class for Keycloak OAuth2 relay authentication; includes `AuthStorage` adapter pattern for persistence |
| `src/index.ts` | Exports `createAudaraiClient(config)` factory function — the primary entry point for SDK consumers |
| `demo/src/components/ConnectPanel.vue` | Demo app's interactive configuration UI; collects auth credentials, base URL, LiveKit URL, and token refresh endpoint from user input |
| `demo/src/composables/useClient.ts` | Vue composable wrapping `createAudaraiClient`; maintains module-level singleton client state |
| `demo/vite.config.ts` | Vite build configuration; resolves `@audarai/sdk` alias to source for HMR during development |
| `package.json` / `tsconfig.json` | Build toolchain configuration (tsup for SDK bundling, vue-tsc + vite for demo) |

---

## Architecture and Conventions

### Authentication Mode Exclusivity

The `AudaraiClient` constructor enforces that **exactly one** of four authentication modes is configured:

```typescript
const authModes = [
  config.publishableKey != null,
  config.accessToken != null,
  config.apiKey != null,
  config.appId != null,
].filter(Boolean).length;
// Must equal 1, otherwise throws AuthenticationError
```

Additionally, `appSecret` is only valid when paired with `appId` (backend-only mode).

### Token Management Layering

Configuration drives a layered token management architecture:

1. **HTTP Token Manager**: Handles API request authentication
2. **WebSocket Token Manager** (optional): Separate provider for WebSocket session tokens when needed (e.g., `accessToken` mode exchanges JWT for short-lived `stk_` tokens)

The `TokenManager` class implements proactive token refresh based on `refreshThresholdSeconds` (default: 30s before expiry).

### RelayAuth Persistence Strategy

The `RelayAuth` class uses an adapter pattern for token storage:

- **Default**: `LocalStorageAdapter` wraps `globalThis.localStorage` (browser)
- **Fallback**: `MemoryStorage` for SSR/Node environments without localStorage
- **Custom**: Consumers can inject any `AuthStorage` implementation via config

Tokens are persisted under a configurable key prefix (default: `"audar_auth"`).

### Demo App Configuration Flow

The demo application does not use environment variables or build-time config injection. Instead:

1. User enters credentials into `ConnectPanel.vue` form fields
2. On "Connect", the form values are assembled into an `AudaraiClientConfig` object
3. `useClient().connect(cfg)` creates the client and probes connectivity via `tts.listSpeakers()`
4. The connected client is stored as a Vue `shallowRef` singleton shared across all panel components

For the **relay auth mode**, the demo persists the relay base URL in `localStorage` under `"demo_relay_base_url"` to survive OAuth2 redirect round-trips.

### Build-Time Configuration Only

The only configuration files present are **build toolchain** configs:
- `tsconfig.json`: TypeScript compiler options (target ES2020, strict mode, bundler module resolution)
- `demo/vite.config.ts`: Vite plugin setup, SDK source alias for dev HMR, server host allowance
- `package.json`: npm scripts (`build`, `dev`, `prepare`), dependency declarations

These do not affect runtime behavior.

---

## Rules Developers Should Follow

### For SDK Consumers

1. **Choose exactly one auth mode** when creating a client. Mixing modes throws `AuthenticationError`.
2. **Never expose `appSecret` in browser code**. Use `appId` alone for frontend (session-token flow) or `appId + appSecret` only in backend/Node environments.
3. **Provide `onTokenRefresh` callback** when using static `accessToken` strings to enable automatic re-authentication on 401 responses.
4. **Use `accessToken` as a function** (`() => Promise<string>`) for dynamic token sources (e.g., Keycloak adapters) instead of static strings + refresh callback.
5. **Set `livekitUrl`** if known ahead of time to enable DNS/TLS pre-connection optimization (~500-800ms latency reduction).
6. **Inject custom `fetch`** in Node.js environments (e.g., `node-fetch`) since the SDK defaults to `globalThis.fetch`.

### For Demo App Contributors

1. **Do not hardcode production credentials**. The demo ships with a sample publishable key for testing; replace via the UI at runtime.
2. **Relay base URL persists in localStorage** under `"demo_relay_base_url"`. Clear browser storage to reset.
3. **All config is ephemeral** — no config survives page reload unless entered again or stored by RelayAuth's internal persistence.

### For SDK Maintainers

1. **Adding new config fields**: Extend `AudaraiClientConfig` in `src/types.ts`, update constructor validation in `src/client.ts`, and document in JSDoc comments.
2. **Backward compatibility**: All new config fields must be optional with sensible defaults to avoid breaking existing consumers.
3. **No dotenv/env-var integration planned**: The SDK is designed as a library consumed by diverse environments (browser, Node, SSR); environment-specific config loading is the consumer's responsibility.

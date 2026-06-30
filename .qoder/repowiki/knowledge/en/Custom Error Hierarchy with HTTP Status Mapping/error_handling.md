## Overview

The AudarAI JavaScript SDK uses a **custom error class hierarchy** rooted at `AudaraiError` (extends native `Error`) to represent domain-specific failures. Errors are thrown synchronously from API methods and propagated as rejected Promises, following standard TypeScript/JavaScript async conventions.

## Error Class Hierarchy

All custom errors live in `src/errors.ts` and are re-exported from the package entry point (`src/index.ts`).

### Base Error
- **`AudaraiError`** — Root of the hierarchy. Sets `this.name = "AudaraiError"`. No additional properties beyond `message`.

### Concrete Error Types
1. **`AuthenticationError`** — Authentication or authorization failures (invalid token, missing credentials, expired session). Default message: `"Authentication failed"`.
2. **`InsufficientBalanceError`** — Account balance too low to perform the requested operation. Default message: `"Insufficient balance"`.
3. **`RateLimitedError`** — HTTP 429 responses. Includes an optional `retryAfter?: number` property parsed from the `Retry-After` header.
4. **`ApiError`** — Generic API failure carrying structured metadata:
   - `statusCode: number` — HTTP status code
   - `code: number` — Application-level error code from the JSON response body (`json.code`)

## Error Generation Strategy

### HTTP Response Mapping (`HttpClient._handleResponse`)
The central error-generation logic lives in `src/client.ts`, method `_handleResponse`. It maps HTTP status codes to typed errors:

| Status | Error Thrown | Notes |
|--------|-------------|-------|
| 401    | `AuthenticationError` | After one automatic retry with refreshed token |
| 402    | `InsufficientBalanceError` | Payment required |
| 429    | `RateLimitedError` | Parses `Retry-After` header if present |
| Other non-OK | `ApiError` | Extracts `message` and `code` from JSON body; falls back to `res.statusText` and `res.status` |

### Automatic 401 Retry
When the initial request returns 401, `HttpClient.request` performs **one automatic retry**:
1. If `onTokenRefresh` callback is configured, it calls it to obtain a fresh JWT, seeds the token manager, and retries.
2. Otherwise, it invalidates the cached token and re-fetches via the existing provider.
3. If the retry also returns 401, `AuthenticationError` is thrown without further retries.

### Auth Module Errors (`RelayAuth`)
The OAuth2 relay client in `src/auth.ts` throws `AuthenticationError` for:
- Not logged in when `getAccessToken()` is called
- Missing `refresh_token`
- Refresh endpoint failure (after clearing local storage and invoking `onSessionExpired`)

It also uses `ApiError` via the internal `unwrap` helper for relay API failures.

### WebSocket & Streaming Errors
WebSocket-based APIs (STT, Translation) do **not** throw typed errors. Instead:
- Protocol-level errors arrive as `{ type: "error", ... }` messages parsed in the `SttWebSocket` / `TranslationWebSocket` constructors.
- The `onError` handler in the respective `*Handlers` interface receives these messages.
- SSE streaming (`transcribeStream`) converts server-sent `error` fields into plain `Error` objects passed to `handlers.onError`.

## Error Consumption Pattern

The demo application (`demo/src/composables/useLog.ts`) demonstrates the canonical consumption pattern using `instanceof` guards:

```typescript
function logError(err: unknown) {
  if (err instanceof InsufficientBalanceError) {
    log("Insufficient balance, please top up", "err");
  } else if (err instanceof RateLimitedError) {
    log(`Rate limited, retry after ${err.retryAfter ?? "?"}s`, "err");
  } else if (err instanceof AuthenticationError) {
    log(`Authentication failed: ${err.message}`, "err");
  } else if (err instanceof ApiError) {
    log(`API error [${err.statusCode}/${err.code}]: ${err.message}`, "err");
  } else if (err instanceof Error) {
    log(err.message, "err");
  } else {
    log(String(err), "err");
  }
}
```

This pattern ensures specific errors are handled with contextual messages while falling back gracefully to generic `Error` and unknown types.

## Developer Rules

1. **Always use typed errors** — Throw `AuthenticationError`, `InsufficientBalanceError`, `RateLimitedError`, or `ApiError` instead of bare `Error` for recoverable API failures.
2. **Preserve error context** — When constructing `ApiError`, pass both `statusCode` and the application `code` from the response body.
3. **Use `instanceof` for discrimination** — Consumers should check error types with `instanceof` guards ordered from most specific to least specific.
4. **Do not swallow errors silently** — WebSocket `onError` handlers and SSE stream error callbacks must be wired; unhandled protocol errors are silently ignored in the current implementation.
5. **Respect the 401 retry contract** — The `HttpClient` handles one automatic retry; do not implement duplicate retry logic at the call site.
6. **Export all error classes** — Every new error type must be exported from `src/errors.ts` and re-exported from `src/index.ts` so consumers can import them from `@audarai/sdk`.
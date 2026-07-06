The AudarAI JavaScript SDK monorepo does not implement a traditional backend-style logging system (e.g., file sinks, structured JSON logs, or log-level filtering via frameworks like `pino` or `winston`). Instead, it employs a **UI-scoped event logging pattern** specifically within the interactive demo application.

### 1. Approach and Architecture
*   **In-Memory Event Log:** The core logging mechanism is a Vue composable (`useLog`) that maintains an in-memory array of log entries. This is designed for real-time visibility in the browser-based demo rather than persistent storage or server-side diagnostics.
*   **Structured Entries:** Logs are structured as `LogEntry` objects containing:
    *   `id`: A sequential identifier.
    *   `text`: The human-readable message.
    *   `level`: A semantic level restricted to `"ok"`, `"err"`, `"info"`, `"warn"`, or `""` (empty).
    *   `time`: A localized timestamp string.
*   **Error Normalization:** The system includes a specialized `logError` function that normalizes various SDK-specific error types (`ApiError`, `AuthenticationError`, `InsufficientBalanceError`, `RateLimitedError`) into consistent, user-friendly log messages with the `"err"` level.

### 2. Key Files
*   `demo/src/composables/useLog.ts`: Defines the `useLog` composable, `LogEntry` interface, and `LogLevel` type. It handles the state management of the log buffer.
*   `demo/src/components/LogBox.vue`: A Vue component that renders the log entries, providing auto-scrolling functionality and visual styling based on the log level.

### 3. Conventions and Rules
*   **No Console Logging in Core SDK:** The core SDK (`src/`) avoids using `console.log` or `console.error` for operational flow. It relies on throwing typed errors (`AudaraiError` subclasses) which are then caught and logged by the consumer (e.g., the demo app).
*   **Demo-Specific Implementation:** The logging system is strictly confined to the `demo/` directory. It is not exported from the main SDK package (`@audarai/sdk`), meaning consumers of the library must implement their own logging or error-handling strategies.
*   **Visual Feedback:** Log levels are primarily used for visual distinction in the UI (e.g., red text for `"err"`) rather than for filtering output in a terminal or log aggregator.

### 4. Developer Guidance
*   **For SDK Consumers:** Do not rely on internal SDK logging. Instead, handle promises and catch typed errors (e.g., `instanceof ApiError`) to integrate with your own logging infrastructure.
*   **For Demo Developers:** Use the `useLog` composable to record significant user actions or API responses. Use `logError` for any caught exceptions to ensure consistent error reporting in the UI.
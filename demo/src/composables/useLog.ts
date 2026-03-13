import { ref } from "vue";
import {
  ApiError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
} from "@aivox/sdk";

export type LogLevel = "ok" | "err" | "info" | "warn" | "";

export interface LogEntry {
  id: number;
  text: string;
  level: LogLevel;
  time: string;
}

let seq = 0;

export function useLog() {
  const entries = ref<LogEntry[]>([]);

  function log(text: string, level: LogLevel = "") {
    entries.value.push({ id: seq++, text, level, time: new Date().toLocaleTimeString() });
  }

  function clear() {
    entries.value = [];
  }

  function logError(err: unknown) {
    if (err instanceof InsufficientBalanceError) {
      log("余额不足，请充值", "err");
    } else if (err instanceof RateLimitedError) {
      log(`请求过频，请 ${err.retryAfter ?? "?"}s 后重试`, "err");
    } else if (err instanceof AuthenticationError) {
      log(`认证失败: ${err.message}`, "err");
    } else if (err instanceof ApiError) {
      log(`API 错误 [${err.statusCode}/${err.code}]: ${err.message}`, "err");
    } else if (err instanceof Error) {
      log(err.message, "err");
    } else {
      log(String(err), "err");
    }
  }

  return { entries, log, clear, logError };
}

import { ref } from "vue";
import {
  ApiError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitedError,
} from "@audarai/sdk";

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

  return { entries, log, clear, logError };
}

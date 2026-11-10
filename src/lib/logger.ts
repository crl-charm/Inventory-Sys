import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tiny structured (one JSON object per line) logger. Render shows stdout/stderr
 * as-is, so JSON lines are easy to search ("event":"db_stale_connection").
 *
 * Safety rules:
 *  - Never pass request bodies, cookies, tokens, or connection strings in.
 *  - Errors go through serializeError(), which drops mysql2's `sql` property
 *    (it can contain interpolated values such as usernames).
 *  - Any field whose NAME looks sensitive is replaced with "[redacted]".
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|hash|ssl_ca|dsn|connection/i;

/** Per-request context (request id) carried across awaits automatically. */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { message: String(error) };
  const e = error as {
    name?: string;
    code?: unknown;
    errno?: unknown;
    sqlState?: unknown;
    fatal?: unknown;
    message?: unknown;
  };
  return {
    name: e.name,
    code: e.code,
    errno: e.errno,
    sqlState: e.sqlState,
    fatal: e.fatal,
    message: typeof e.message === "string" ? e.message.slice(0, 300) : undefined,
  };
}

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    requestId: requestContext.getStore()?.requestId,
    ...safe,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Minimal structured logger for server-side code (proxy route, page loads).
 * One JSON object per line. Callers must never pass cookies, bodies, tokens
 * or URLs that contain credentials — only paths, statuses and timings.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|hash/i;

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  if (ORDER[level] < (ORDER[configured] ?? ORDER.info)) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

import type { RetryPolicy } from "./retry";

/**
 * Server-side policy for talking to the API. Tunable from Render's
 * Environment tab without code changes; every value has a safe default and is
 * clamped to a sane range.
 *
 *   UPSTREAM_TIMEOUT_MS       per attempt            (default 45000)
 *   UPSTREAM_TOTAL_BUDGET_MS  whole call             (default 90000)
 *   UPSTREAM_MAX_ATTEMPTS     tries for safe calls   (default 15)
 *
 * A sleeping Render free service needs roughly 30–60 s to wake, so one
 * attempt must be allowed to run that long. Render can also answer an
 * instant 502/503/504 while the API is restarting; 15 attempts with the 8 s
 * backoff cap span the whole budget instead of giving up after a few seconds.
 */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function upstreamPolicy(replaySafe: boolean): RetryPolicy {
  return {
    maxAttempts: replaySafe ? envInt("UPSTREAM_MAX_ATTEMPTS", 15, 1, 30) : 3,
    timeoutMs: envInt("UPSTREAM_TIMEOUT_MS", 45_000, 1_000, 120_000),
    totalBudgetMs: envInt("UPSTREAM_TOTAL_BUDGET_MS", 90_000, 1_000, 180_000),
    baseDelayMs: 500,
    maxDelayMs: 8_000,
    // "pre-send" still allows up to 3 tries, but only for errors that prove
    // the request never reached the API (e.g. ECONNREFUSED while it boots).
    mode: replaySafe ? "replay-safe" : "pre-send",
  };
}

/**
 * Which requests may the proxy automatically send again after an AMBIGUOUS
 * failure (timeout, reset, 502/503/504 — where the API may already have acted)?
 *
 *  - Reads: always.
 *  - POST /api/auth/login, /api/auth/logout: repeating them changes nothing.
 *  - POST /api/sales WITH a requestId: the API stores request_id under a
 *    unique key and replays the original sale, so a repeat can never
 *    double-deduct stock (see backend sales-service "Idempotent" note).
 *  - Everything else (stock-in, physical count, void, product/category
 *    create/edit, activate/deactivate): NEVER. They get "pre-send" retries only.
 */
export function isReplaySafe(method: string, path: string, body?: ArrayBuffer): boolean {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return true;
  if (verb !== "POST") return false;
  if (path === "/api/auth/login" || path === "/api/auth/logout") return true;
  if (path === "/api/sales" && body) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body)) as { requestId?: unknown };
      return typeof parsed.requestId === "string" && parsed.requestId.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

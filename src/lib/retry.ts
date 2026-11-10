/**
 * Resilient fetch for a backend that may be asleep (Render free plan) or
 * restarting. Used by the /api proxy, server-side page loads and the browser
 * client. Dependency-free so it runs in Node and in the browser.
 *
 * Guarantees:
 *  - Every attempt has a timeout, and the whole call has a total time budget.
 *  - Bounded attempts, exponential backoff with jitter, Retry-After honoured
 *    (capped). No infinite loops, no polling.
 *  - Mode "replay-safe": network errors, timeouts and 502/503/504 are retried.
 *  - Mode "pre-send": for requests that must NOT be repeated (stock changes,
 *    voids...). Only errors that prove the request never left this machine
 *    (connection refused, DNS failure, connect timeout) are retried; a
 *    timeout, reset, or any HTTP response is final.
 *  - 4xx responses (validation, auth, not found) are never retried.
 */

export interface RetryPolicy {
  /** Total tries, including the first. */
  maxAttempts: number;
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Wall-clock cap for the whole call, including waits. */
  totalBudgetMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  mode: "replay-safe" | "pre-send";
}

export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Error codes that prove the request never reached the server. */
const PRE_SEND_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export class UpstreamUnavailableError extends Error {
  readonly kind: "timeout" | "network";
  readonly code: string | undefined;
  readonly attempts: number;

  constructor(kind: "timeout" | "network", code: string | undefined, attempts: number) {
    super(
      kind === "timeout"
        ? `Upstream did not answer in time (${attempts} attempt(s)).`
        : `Upstream unreachable${code ? ` (${code})` : ""} after ${attempts} attempt(s).`
    );
    this.name = "UpstreamUnavailableError";
    this.kind = kind;
    this.code = code;
    this.attempts = attempts;
  }
}

export interface RetryHooks {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** Return false to treat a retryable status as final (e.g. already retried upstream). */
  shouldRetryResponse?: (response: Response) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

/** Seconds ("120") or HTTP-date → milliseconds from now, or null if unusable. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Equal-jitter exponential backoff: half fixed, half random, capped. */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function errorCode(error: unknown): string | undefined {
  const e = error as {
    code?: unknown;
    cause?: { code?: unknown; errors?: Array<{ code?: unknown }> };
  };
  const candidates = [e?.code, e?.cause?.code, e?.cause?.errors?.[0]?.code];
  for (const c of candidates) if (typeof c === "string") return c;
  return undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  policy: RetryPolicy,
  hooks: RetryHooks = {}
): Promise<Response> {
  const doFetch = hooks.fetchImpl ?? fetch;
  const sleep = hooks.sleep ?? defaultSleep;
  const random = hooks.random ?? Math.random;
  const now = hooks.now ?? Date.now;
  const callerSignal = init.signal ?? undefined;
  const startedAt = now();

  let lastResponse: Response | undefined;
  let lastKind: "timeout" | "network" = "network";
  let lastCode: string | undefined;
  let attempt = 0;

  while (attempt < policy.maxAttempts) {
    attempt += 1;
    const remaining = policy.totalBudgetMs - (now() - startedAt);
    if (remaining <= 0) break;

    // Per-attempt timeout, linked to the caller's own abort signal.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.min(policy.timeoutMs, remaining));
    const onCallerAbort = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    let retryReason: string | null = null;
    let retryAfterMs: number | null = null;

    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      const retryable =
        policy.mode === "replay-safe" &&
        RETRYABLE_STATUSES.has(response.status) &&
        (hooks.shouldRetryResponse?.(response) ?? true);
      if (!retryable || attempt >= policy.maxAttempts) return response;
      lastResponse = response;
      retryReason = `http_${response.status}`;
      retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now());
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (callerSignal?.aborted) throw error; // the user navigated away: stop.
      lastResponse = undefined;
      lastKind = timedOut ? "timeout" : "network";
      lastCode = timedOut ? "TIMEOUT" : errorCode(error);
      const provedUnsent = !timedOut && lastCode !== undefined && PRE_SEND_CODES.has(lastCode);
      const retryable = policy.mode === "replay-safe" || provedUnsent;
      if (!retryable || attempt >= policy.maxAttempts) {
        throw new UpstreamUnavailableError(lastKind, lastCode, attempt);
      }
      retryReason = timedOut ? "timeout" : `network_${lastCode ?? "unknown"}`;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }

    // Wait before the next attempt: backoff (+jitter), or Retry-After if longer
    // (capped so a hostile/huge header cannot stall us).
    const backoff = backoffDelay(attempt, policy.baseDelayMs, policy.maxDelayMs, random);
    const delayMs = Math.min(Math.max(backoff, retryAfterMs ?? 0), policy.maxDelayMs);
    if (now() - startedAt + delayMs >= policy.totalBudgetMs) break;
    hooks.onRetry?.({ attempt, delayMs, reason: retryReason });
    await sleep(delayMs);
  }

  if (lastResponse) return lastResponse;
  throw new UpstreamUnavailableError(lastKind, lastCode, attempt);
}

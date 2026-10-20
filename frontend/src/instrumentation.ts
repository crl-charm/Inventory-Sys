/**
 * Runs once when the web server starts.
 *
 * On Render's free plan the web and API sleep independently. The first
 * request wakes the web; this fire-and-forget loop starts the API at the same
 * time instead of leaving it asleep until the login page renders.
 *
 * The loop keeps trying for `WAKE_WINDOW_MS` because Render occasionally
 * takes several minutes to boot a free service (observed 2026-10-20: the API
 * answered 502 for ~8 minutes). Page requests still have their own 90 s
 * retry budget; this only makes sure the API gets woken in the background and
 * stays warm once it answers.
 *
 * IMPORTANT: register() must complete before Next.js handles requests, so the
 * loop is deliberately not awaited. A sleeping API must never delay the web.
 */
import { resolveBackendUrl } from "./lib/backend-url";
import { log } from "./lib/log";

const WAKE_ATTEMPT_TIMEOUT_MS = 20_000;
const WAKE_WINDOW_MS = 10 * 60_000;
const WAKE_MAX_DELAY_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exported for tests. Pings `/health` until it answers 2xx or the window
 * closes. `/health` is the API's cheap liveness endpoint (no database
 * access), so pinging it cannot add database load.
 */
export async function wakeApi(backendUrl: string): Promise<void> {
  const deadline = Date.now() + WAKE_WINDOW_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const startedAt = Date.now();
    let status: number | null = null;
    let reason: string | null = null;
    try {
      const response = await fetch(`${backendUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(WAKE_ATTEMPT_TIMEOUT_MS),
      });
      status = response.status;
      if (response.ok) {
        log("info", "startup_wake", {
          status,
          attempt,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
    } catch (error) {
      reason = error instanceof Error ? error.name : "unknown";
    }

    log("warn", "startup_wake_retry", {
      status,
      reason,
      attempt,
      durationMs: Date.now() - startedAt,
    });

    const delay = Math.min(WAKE_MAX_DELAY_MS, 2_000 * attempt);
    if (Date.now() + delay >= deadline) break;
    await sleep(delay);
  }

  log("warn", "startup_wake_gave_up", {
    attempts: attempt,
    windowMs: WAKE_WINDOW_MS,
  });
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  let backendUrl: string;
  try {
    backendUrl = resolveBackendUrl();
  } catch (error) {
    // The first page request already produces the actionable config error;
    // don't fail the whole web server startup with a second copy of it.
    log("warn", "startup_wake_skipped", {
      reason: error instanceof Error ? error.message : "invalid BACKEND_URL",
    });
    return;
  }

  void wakeApi(backendUrl);
}

/**
 * Runs once when the web server starts.
 *
 * On Render's free plan the web and API sleep independently. The first
 * request wakes the web; this fire-and-forget ping starts the API at the same
 * time instead of leaving it asleep until the login page renders.
 *
 * IMPORTANT: register() must complete before Next.js handles requests, so the
 * ping is deliberately not awaited. A sleeping API must never delay the web.
 */
import { resolveBackendUrl } from "./lib/backend-url";
import { log } from "./lib/log";

const WAKE_TIMEOUT_MS = 60_000;

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

  const startedAt = Date.now();
  void fetch(`${backendUrl}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  })
    .then((response) => {
      log("info", "startup_wake", {
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
    })
    .catch((error: unknown) => {
      log("warn", "startup_wake_failed", {
        reason: error instanceof Error ? error.name : "unknown",
        durationMs: Date.now() - startedAt,
      });
    });
}

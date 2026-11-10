/**
 * Runs once when the unified Next.js server starts.
 *
 * Warms up the MySQL connection pool in the background so the first request
 * after a cold start has a live connection ready, without blocking Next.js
 * from binding its port immediately.
 */
import { checkConfig } from "./lib/config";
import { log } from "./lib/log";

const WAKE_WINDOW_MS = 2 * 60_000;
const WAKE_MAX_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exported for tests. Probes the database until it answers or the warm-up
 * window closes.
 */
export async function warmDatabase(
  ping?: () => Promise<boolean>
): Promise<void> {
  const probe =
    ping ??
    (async () => {
      const { pingDatabase } = await import("./lib/db");
      return pingDatabase(5_000);
    });

  const deadline = Date.now() + WAKE_WINDOW_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const startedAt = Date.now();
    let reachable = false;
    try {
      reachable = await probe();
    } catch {
      reachable = false;
    }

    if (reachable) {
      log("info", "startup_db_ready", {
        attempt,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    log("warn", "startup_db_retry", {
      attempt,
      durationMs: Date.now() - startedAt,
    });

    const delay = Math.min(WAKE_MAX_DELAY_MS, 2_000 * attempt);
    if (Date.now() + delay >= deadline) break;
    await sleep(delay);
  }

  log("warn", "startup_db_gave_up", {
    attempts: attempt,
    windowMs: WAKE_WINDOW_MS,
  });
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.RENDER === "true") {
    const report = checkConfig();
    for (const warning of report.warnings) {
      log("warn", "config_warning", { message: warning });
    }
    if (report.errors.length > 0) {
      log("error", "config_invalid", { problems: report.errors });
      return;
    }
  }

  void warmDatabase();
}

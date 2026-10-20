import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveBackendUrl } from "./backend-url";
import { log } from "./log";
import { fetchWithRetry, UpstreamUnavailableError } from "./retry";
import { upstreamPolicy } from "./upstream";

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const UNAVAILABLE_MESSAGE =
  "The server is starting up or temporarily unavailable. Please wait a few seconds and try again.";

/**
 * Server-side GET to the API (used by page layouts). Reads are replay-safe, so
 * they use the same timeout + backoff policy as the /api proxy. A sleeping API
 * therefore delays the page instead of crashing it, and a dead one produces a
 * clear message instead of a hung request.
 */
export async function backendGet<T>(path: string): Promise<T> {
  const cookie = (await cookies()).toString();
  const backendUrl = resolveBackendUrl(); // throws an actionable error on a bad config
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${backendUrl}${path}`,
      { headers: { cookie }, cache: "no-store" },
      upstreamPolicy(true),
      {
        onRetry: ({ attempt, delayMs, reason }) =>
          log("warn", "backend_get_retry", { path, attempt, delayMs, reason }),
      }
    );
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) {
      log("error", "backend_get_failed", {
        path, kind: error.kind, code: error.code, attempts: error.attempts,
      });
    }
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // Not JSON (e.g. a proxy's HTML error page while the API wakes up).
    log("error", "backend_get_non_json", { path, status: response.status });
    throw new Error(UNAVAILABLE_MESSAGE);
  }
  if (!payload.success) {
    if (payload.error.code === "NOT_FOUND") notFound();
    throw new Error(payload.error.message);
  }
  return payload.data;
}

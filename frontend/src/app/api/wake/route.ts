import { cookies } from "next/headers";
import { resolveBackendUrl } from "@/lib/backend-url";

/**
 * Lightweight readiness probe for the browser's waking screen.
 *
 * The normal `/api/[...path]` proxy retries for up to 90 s, which is correct
 * for a user action but wrong for a 5-10 s poll. This route checks the same
 * `/api/auth/me` endpoint the protected layout needs, once, with a short
 * timeout. A 200 (signed in) or 401 (signed out) means the API and database
 * are up; anything else keeps the waking screen waiting.
 *
 * The status is always HTTP 200 with `{ ready: bool }` so the browser does not
 * log a failed resource every few seconds.
 */
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 10_000;

function response(ready: boolean): Response {
  return Response.json(
    { ready },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    }
  );
}

export async function GET(): Promise<Response> {
  try {
    const cookie = (await cookies()).toString();
    const upstream = await fetch(`${resolveBackendUrl()}/api/auth/me`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const isJson = (upstream.headers.get("content-type") ?? "").includes(
      "application/json"
    );
    return response(
      isJson && (upstream.status === 200 || upstream.status === 401)
    );
  } catch {
    return response(false);
  }
}

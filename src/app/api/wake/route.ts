import { isDatabaseReady } from "@/lib/db";

/**
 * Lightweight readiness probe for the browser's waking screen.
 *
 * Checks database connectivity directly in-process without depending on a
 * session cookie. Always returns HTTP 200 with `{ ready: bool }` so the
 * browser does not log failed network resources while waiting for MySQL.
 */
export const dynamic = "force-dynamic";

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
    return response(await isDatabaseReady());
  } catch {
    return response(false);
  }
}

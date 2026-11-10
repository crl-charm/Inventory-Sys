export const dynamic = "force-dynamic";

/**
 * GET /health — cheap liveness probe (no database access).
 * Used by Render's healthCheckPath and external cron jobs to keep the single
 * web service warm without adding database load.
 */
export async function GET(): Promise<Response> {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}


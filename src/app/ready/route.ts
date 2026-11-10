import { isDatabaseReady } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /ready — database readiness check (cached for 10s so concurrent probes
 * never flood MySQL). Do not point Render's liveness healthCheckPath here;
 * use /health for liveness and /ready for readiness diagnostics.
 */
export async function GET(): Promise<Response> {
  const ready = await isDatabaseReady();
  return ready
    ? Response.json(
        { status: "ready" },
        { status: 200, headers: { "cache-control": "no-store" } }
      )
    : Response.json(
        { status: "unavailable" },
        {
          status: 503,
          headers: { "retry-after": "5", "cache-control": "no-store" },
        }
      );
}


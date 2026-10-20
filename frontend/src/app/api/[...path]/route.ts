import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { BackendConfigError, resolveBackendUrl } from "@/lib/backend-url";
import { log } from "@/lib/log";
import { fetchWithRetry, UpstreamUnavailableError } from "@/lib/retry";
import { isReplaySafe, upstreamPolicy } from "@/lib/upstream";

/**
 * Same-origin proxy: browser → this route → API (BACKEND_URL).
 *
 * Why it is more than a pass-through:
 *  - The API (Render free plan) sleeps after ~15 min idle and needs 30–60 s to
 *    wake. Every attempt has a timeout, and safe requests are retried with
 *    exponential backoff + jitter (see lib/retry.ts).
 *  - Writes are sent ONCE. The only exceptions are requests that are provably
 *    replay-safe (see isReplaySafe) or that failed before leaving this server.
 *  - If the API stays unreachable, the browser gets a clean JSON error
 *    envelope (never Next's HTML 500 page, which the UI used to misreport as
 *    "is npm run dev still running?").
 */

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return Response.json(
    { success: false, error: { code, message } },
    {
      status,
      headers: {
        "x-request-id": requestId,
        // Tells the browser client the proxy already retried: don't stack more.
        "x-upstream-exhausted": "1",
        ...extraHeaders,
      },
    }
  );
}

async function proxy(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const { path } = await ctx.params;
  const apiPath = `/api/${path.join("/")}`;
  const method = request.method;

  let backendUrl: string;
  try {
    backendUrl = resolveBackendUrl();
  } catch (error) {
    const message = error instanceof BackendConfigError ? error.message : "Server configuration error.";
    log("error", "proxy_config_error", { requestId, path: apiPath, message });
    return errorResponse(500, "CONFIG_ERROR", message, requestId);
  }

  const incoming = new URL(request.url);
  const target = `${backendUrl}${apiPath}${incoming.search}`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-request-id", requestId);

  const isRead = method === "GET" || method === "HEAD";
  const body = isRead ? undefined : await request.arrayBuffer();
  const replaySafe = isReplaySafe(method, apiPath, body);
  let attempts = 1;

  try {
    const upstream = await fetchWithRetry(
      target,
      { method, headers, body, redirect: "manual", signal: request.signal },
      upstreamPolicy(replaySafe),
      {
        onRetry: ({ attempt, delayMs, reason }) => {
          attempts = attempt + 1;
          log("warn", "proxy_retry", { requestId, method, path: apiPath, attempt, delayMs, reason });
        },
      }
    );

    const type = upstream.headers.get("content-type") ?? "";
    const durationMs = Date.now() - startedAt;

    // Render's own "service unavailable / waking up" pages are HTML, not our
    // JSON envelope. Convert them so the UI can show a proper message.
    if (upstream.status >= 502 && upstream.status <= 504 && !type.includes("application/json")) {
      log("warn", "proxy_upstream_unavailable", {
        requestId, method, path: apiPath, status: upstream.status, durationMs, attempts,
      });
      await upstream.body?.cancel().catch(() => undefined);
      return errorResponse(
        503,
        "BACKEND_UNAVAILABLE",
        "The server is starting up or temporarily unavailable. Please wait a few seconds and try again.",
        requestId,
        { "retry-after": "10" }
      );
    }

    log(upstream.status >= 500 ? "error" : "info", "proxy_request", {
      requestId, method, path: apiPath, status: upstream.status, durationMs, attempts,
    });

    const out = new Headers();
    if (type) out.set("content-type", type);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) out.set("retry-after", retryAfter);
    for (const cookieValue of upstream.headers.getSetCookie()) {
      out.append("set-cookie", cookieValue);
    }
    out.set("x-request-id", requestId);

    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (error) {
    if (request.signal.aborted) {
      // The browser went away (navigation, closed tab). Nothing to answer.
      return new Response(null, { status: 499 });
    }
    const durationMs = Date.now() - startedAt;
    if (error instanceof UpstreamUnavailableError) {
      log("error", "proxy_upstream_failed", {
        requestId, method, path: apiPath, kind: error.kind, code: error.code,
        attempts: error.attempts, durationMs, replaySafe,
      });
      // For a write that was already sent, we cannot know whether it was saved.
      const ambiguousWrite = !isRead && !replaySafe && error.kind === "timeout";
      return errorResponse(
        503,
        "BACKEND_UNAVAILABLE",
        ambiguousWrite
          ? "The server took too long to answer. Your change may or may not have been saved — check the list before trying again."
          : "Cannot reach the server right now. It may be waking up — wait a few seconds and press Retry.",
        requestId,
        { "retry-after": "10" }
      );
    }
    log("error", "proxy_unexpected_error", {
      requestId, method, path: apiPath, durationMs, message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(502, "BAD_GATEWAY", "Something went wrong reaching the server. Please try again.", requestId);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

import { type NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

/**
 * After an API restart (deploys, crashes) a pooled keep-alive socket can be
 * half-dead: the request never reaches the server and fails with ECONNRESET.
 * Safe reads retry briefly; writes are sent exactly once so that a request
 * the API may already have processed is never repeated.
 */
async function upstreamFetch(
  url: string,
  init: RequestInit,
  attempts: number
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
}

async function proxy(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await ctx.params;
  const incoming = new URL(request.url);
  const target = `${BACKEND_URL}/api/${path.join("/")}${incoming.search}`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const method = request.method;
  const isRead = method === "GET" || method === "HEAD";
  const body = isRead ? undefined : await request.arrayBuffer();

  const upstream = await upstreamFetch(
    target,
    { method, headers, body, redirect: "manual" },
    isRead ? 3 : 1
  );

  const out = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) out.set("content-type", type);
  for (const cookieValue of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookieValue);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

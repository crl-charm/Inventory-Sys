import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import * as authMe from "@/app/api/auth/me/route";
import * as productById from "@/app/api/products/[id]/route";
import * as saleById from "@/app/api/sales/[id]/route";

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const UNAVAILABLE_MESSAGE =
  "The database is starting up or temporarily unavailable. Please wait a few seconds and try again.";

/**
 * The database did not answer (sleeping or temporarily unreachable). Callers
 * that can show a waking screen should catch this instead of letting it become
 * a server-render error; auth redirects and real validation/not-found errors
 * still propagate.
 */
export class BackendUnavailableError extends Error {
  constructor() {
    super(UNAVAILABLE_MESSAGE);
    this.name = "BackendUnavailableError";
  }
}

export function isBackendUnavailable(
  error: unknown
): error is BackendUnavailableError {
  return error instanceof BackendUnavailableError;
}

async function dispatchInProcessGet(
  path: string,
  request: Request
): Promise<Response> {
  if (path === "/api/auth/me") {
    return authMe.GET(request);
  }
  const productMatch = /^\/api\/products\/([^/]+)$/.exec(path);
  if (productMatch?.[1]) {
    return productById.GET(request, {
      params: Promise.resolve({ id: productMatch[1] }),
    });
  }
  const saleMatch = /^\/api\/sales\/([^/]+)$/.exec(path);
  if (saleMatch?.[1]) {
    return saleById.GET(request, {
      params: Promise.resolve({ id: saleMatch[1] }),
    });
  }
  throw new Error(`Unsupported in-process server path: ${path}`);
}

/**
 * Server-side data fetch (used by Server Component layouts and pages).
 * Executes in-process inside the unified Next.js server — zero HTTP proxy hops
 * and no external BACKEND_URL needed.
 */
export async function backendGet<T>(path: string): Promise<T> {
  const cookie = (await cookies()).toString();
  const request = new Request(`http://localhost${path}`, {
    headers: { cookie },
  });

  const response = await dispatchInProcessGet(path, request);

  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();
  if (response.status === 503) throw new BackendUnavailableError();

  const payload = (await response.json()) as Envelope<T>;
  if (!payload.success) {
    if (payload.error.code === "NOT_FOUND") notFound();
    if (payload.error.code === "DATABASE_UNAVAILABLE") {
      throw new BackendUnavailableError();
    }
    throw new Error(payload.error.message);
  }
  return payload.data;
}

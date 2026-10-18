import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/**
 * The API is a separate Node process. When it restarts (deploys, crashes),
 * this server's keep-alive sockets point at dead connections, and the first
 * request on one can fail with ECONNRESET even though the API is back.
 * Reads are safe to repeat, so retry briefly before giving up.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3
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

export async function backendGet<T>(path: string): Promise<T> {
  const cookie = (await cookies()).toString();
  let response: Response;
  try {
    response = await fetchWithRetry(`${BACKEND_URL}${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Is the backend running on BACKEND_URL?"
    );
  }

  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();

  const payload = (await response.json()) as Envelope<T>;
  if (!payload.success) {
    if (payload.error.code === "NOT_FOUND") notFound();
    throw new Error(payload.error.message);
  }
  return payload.data;
}

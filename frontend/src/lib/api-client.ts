/**
 * Browser-side fetch helper for the JSON API.
 * Every API response uses the envelope: { success, data, message? } or
 * { success: false, error: { code, message, details? } }.
 * Paginated list endpoints additionally include `meta` (page info).
 */

import { fetchWithRetry, UpstreamUnavailableError, type RetryPolicy } from "./retry";

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResult<T> = { success: true; data: T; message?: string } | ApiFailure;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * True when the failure is about reaching the server (asleep, restarting,
   * offline) rather than about the request itself. The UI can offer "Retry".
   */
  get isTemporary(): boolean {
    return (
      this.code === "NETWORK_ERROR" ||
      this.code === "BACKEND_UNAVAILABLE" ||
      this.code === "SERVER_UNAVAILABLE" ||
      this.code === "DATABASE_UNAVAILABLE"
    );
  }
}

const NETWORK_MESSAGE =
  "Can't reach the server. Check your internet connection — if it is fine, the server may still be waking up. Wait a few seconds and press Retry.";
const UNAVAILABLE_MESSAGE =
  "The server is starting up or temporarily unavailable. Please wait a few seconds and press Retry.";

/**
 * Browser → Next.js server. The server-side proxy already retries the API, so
 * the browser only adds a safety net for GETs (e.g. the Next.js service itself
 * was asleep or restarting) and a hard timeout for everything. Writes are never
 * repeated here: the user presses Save/Retry again, and forms that matter
 * (sales) reuse their idempotency key.
 */
const READ_POLICY: RetryPolicy = {
  maxAttempts: 4,
  timeoutMs: 100_000,
  totalBudgetMs: 150_000,
  baseDelayMs: 1_500,
  maxDelayMs: 6_000,
  mode: "replay-safe",
};
const WRITE_POLICY: RetryPolicy = { ...READ_POLICY, maxAttempts: 1, mode: "pre-send" };

interface PaginationMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<{ data: T; meta: PaginationMeta }> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      url,
      {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      method === "GET" ? READ_POLICY : WRITE_POLICY,
      {
        // If the proxy already retried and gave up, don't stack more retries.
        shouldRetryResponse: (r) => !r.headers.has("x-upstream-exhausted"),
      }
    );
  } catch (error) {
    if (error instanceof UpstreamUnavailableError && error.kind === "timeout" && method !== "GET") {
      throw new ApiClientError(
        0,
        "NETWORK_ERROR",
        "The server took too long to answer. Your change may or may not have been saved — check the list before trying again."
      );
    }
    throw new ApiClientError(0, "NETWORK_ERROR", NETWORK_MESSAGE);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // fall through to a generic error below
  }

  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success: unknown }).success === true
  ) {
    const envelope = payload as unknown as { data: T; meta?: PaginationMeta };
    return { data: envelope.data, meta: envelope.meta ?? {} };
  }
  const errorPayload = payload as ApiFailure | null;
  if (errorPayload && errorPayload.success === false && errorPayload.error) {
    throw new ApiClientError(
      response.status,
      errorPayload.error.code,
      errorPayload.error.message,
      errorPayload.error.details
    );
  }
  // Not our JSON envelope: typically an HTML error page from the host while
  // a service wakes up or restarts.
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new ApiClientError(response.status, "SERVER_UNAVAILABLE", UNAVAILABLE_MESSAGE);
  }
  throw new ApiClientError(
    response.status,
    "INTERNAL_ERROR",
    "Something went wrong. Please try again."
  );
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url).then((r) => r.data),
  /** For list endpoints that return `data: items[]` plus `meta` page info. */
  getPaginated: async <T>(url: string): Promise<Paginated<T>> => {
    const { data, meta } = await request<T[]>("GET", url);
    return {
      items: data,
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? data.length,
      total: meta.total ?? data.length,
      totalPages: meta.totalPages ?? 1,
    };
  },
  post: <T>(url: string, body?: unknown) =>
    request<T>("POST", url, body).then((r) => r.data),
  patch: <T>(url: string, body?: unknown) =>
    request<T>("PATCH", url, body).then((r) => r.data),
  delete: <T>(url: string) => request<T>("DELETE", url).then((r) => r.data),
};

/** Small helper: build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

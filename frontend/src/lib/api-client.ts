/**
 * Browser-side fetch helper for the JSON API.
 * Every API response uses the envelope: { success, data, message? } or
 * { success: false, error: { code, message, details? } }.
 * Paginated list endpoints additionally include `meta` (page info).
 */

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
}

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
    response = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Cannot reach the app server. Check that `npm run dev` is running."
    );
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

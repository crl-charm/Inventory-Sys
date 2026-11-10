import { ZodError, type ZodType } from "zod";
import {
  AppError,
  DatabaseUnavailableError,
  ValidationError,
  isDatabaseConnectionError,
} from "./errors";
import { requireUser } from "./auth";
import { log, serializeError } from "./logger";
import { MAX_BODY_BYTES } from "./request-body";
import type { SessionUser } from "@/types";

/**
 * API envelope (spec §12):
 *   success: { success: true, data, message? }
 *   failure: { success: false, error: { code, message, details? } }
 */

export function ok<T>(data: T, message?: string, status = 200): Response {
  return Response.json(
    message !== undefined
      ? { success: true, data, message }
      : { success: true, data },
    { status }
  );
}

export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  return Response.json(
    { success: false, error: { code, message, details } },
    { status, headers: status === 503 ? { "retry-after": "5" } : undefined }
  );
}

/** Map any thrown error to the standard envelope. */
export function fromError(error: unknown): Response {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Please check the submitted values.", 400, {
      fieldErrors: flattenZodIssues(error),
    });
  }
  if (isDatabaseConnectionError(error)) {
    log("warn", "db_unavailable", { error: serializeError(error) });
    const dbError = new DatabaseUnavailableError(error);
    return fail(dbError.code, dbError.message, dbError.status);
  }
  log("error", "unexpected_error", { error: serializeError(error) });
  return fail("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}

export interface ZodFieldErrors {
  [field: string]: string[];
}

function flattenZodIssues(error: ZodError): ZodFieldErrors {
  const fieldErrors: ZodFieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

const TOO_LARGE_MESSAGE = "Request body is too large (maximum 1 MiB).";

async function readBoundedText(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new AppError("VALIDATION_ERROR", 413, TOO_LARGE_MESSAGE);
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("VALIDATION_ERROR", 413, TOO_LARGE_MESSAGE);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Parse and validate a bounded JSON body (max 1 MiB) with a Zod schema. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  const text = await readBoundedText(request);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Please check the submitted values.", {
      fieldErrors: flattenZodIssues(result.error),
    });
  }
  return result.data;
}

export async function parseSearchParams(
  request: Request
): Promise<URLSearchParams> {
  return new URL(request.url).searchParams;
}

/** Parse a numeric path parameter (e.g. sale id) or throw a validation error. */
export function parseNumericParam(
  value: string | undefined,
  label = "id"
): number {
  const parsed = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${label} in the URL.`);
  }
  return parsed;
}

/** Parse ?page=&pageSize= into safe numbers. */
export function parsePagination(
  params: URLSearchParams,
  defaults: { pageSize?: number; maxPageSize?: number } = {}
): { page: number; pageSize: number; offset: number } {
  const maxPageSize = defaults.maxPageSize ?? 100;
  const page = parseNumericParam(params.get("page") ?? "1", "page");
  const rawSize = parseNumericParam(
    params.get("pageSize") ?? String(defaults.pageSize ?? 20), "pageSize"
  );
  const pageSize = Math.min(maxPageSize, rawSize);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new ValidationError("Requested page is too large.");
  }
  return { page, pageSize, offset };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function okPaginated<T>(result: Paginated<T>): Response {
  const { items, ...meta } = result;
  return Response.json({ success: true, data: items, meta });
}

/**
 * Wrap a route handler with CSRF check (Origin must match the same-origin
 * host or FRONTEND_ORIGIN) and auth. Handlers stay thin: parse, call service,
 * respond.
 */
export function withApi(
  options: { auth: "required" | "none" },
  handler: (request: Request, user: SessionUser | null) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      if (isMutation(request)) {
        assertAllowedOrigin(request);
      }
      const user = options.auth === "required" ? await requireUser(request) : null;
      return await handler(request, user);
    } catch (error) {
      return fromError(error);
    }
  };
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isMutation(request: Request): boolean {
  return MUTATION_METHODS.has(request.method.toUpperCase());
}

/** CSRF defense in addition to the SameSite=Lax cookie (spec §17). */
function assertAllowedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "Missing Origin header on a state-changing request."
    );
  }
  const originUrl = safeOrigin(origin);
  if (!originUrl || !allowedOrigins(request).has(originUrl)) {
    throw new AppError("FORBIDDEN", 403, "Cross-origin request rejected.");
  }
}

function allowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  allowed.add(new URL(request.url).origin);

  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (hostHeader) {
    const firstHost = hostHeader.split(",")[0]?.trim();
    if (firstHost) {
      const httpOrigin = safeOrigin(`http://${firstHost}`);
      const httpsOrigin = safeOrigin(`https://${firstHost}`);
      if (httpOrigin) allowed.add(httpOrigin);
      if (httpsOrigin) allowed.add(httpsOrigin);
    }
  }

  const frontend = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  for (const entry of frontend.split(/[,\s]+/)) {
    if (!entry) continue;
    const parsed = safeOrigin(entry);
    if (parsed) allowed.add(parsed);
  }
  return allowed;
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

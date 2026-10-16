import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import {
  AppError,
  DatabaseUnavailableError,
  ValidationError,
  isDatabaseConnectionError,
} from "./errors";
import { requireUser } from "./auth";
import type { SessionUser } from "@/types";

/**
 * API envelope (spec §12):
 *   success: { success: true, data, message? }
 *   failure: { success: false, error: { code, message, details? } }
 *
 * Every route handler returns through these helpers; driver errors and stack
 * traces never reach the browser.
 */

export function ok<T>(data: T, message?: string, status = 200): NextResponse {
  return NextResponse.json(
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
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message, details } },
    { status }
  );
}

/** Map any thrown error to the standard envelope. */
export function fromError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Please check the submitted values.", 400, {
      fieldErrors: flattenZodIssues(error),
    });
  }
  if (isDatabaseConnectionError(error)) {
    const dbError = new DatabaseUnavailableError(error);
    return fail(dbError.code, dbError.message, dbError.status);
  }
  console.error("[api] unexpected error:", error);
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

/** Parse and validate a JSON body with a Zod schema. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      "Please check the submitted values.",
      { fieldErrors: flattenZodIssues(result.error) }
    );
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
  if (!Number.isInteger(parsed) || parsed <= 0) {
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
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const rawSize = Number(params.get("pageSize") ?? defaults.pageSize ?? 20) || 20;
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function okPaginated<T>(result: Paginated<T>): NextResponse {
  const { items, ...meta } = result;
  return NextResponse.json({ success: true, data: items, meta });
}

/**
 * Wrap a route handler with CSRF check (Origin must match for mutating
 * requests) and auth. Handlers stay thin: parse, call service, respond.
 */
export function withApi(
  options: { auth: "required" | "none" },
  handler: (request: Request, user: SessionUser | null) => Promise<NextResponse>
): (request: Request) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    try {
      if (isMutation(request)) {
        assertSameOrigin(request);
      }
      const user = options.auth === "required" ? await requireUser() : null;
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
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin fetches from our own pages always send Origin for
    // non-GET requests; browsers may omit it for same-origin GET.
    throw new AppError(
      "FORBIDDEN",
      403,
      "Missing Origin header on a state-changing request."
    );
  }
  const originUrl = safeOrigin(origin);
  const requestUrl = new URL(request.url);
  if (!originUrl || originUrl !== requestUrl.origin) {
    throw new AppError("FORBIDDEN", 403, "Cross-origin request rejected.");
  }
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Typed application errors. Services throw these; the API layer
 * (src/lib/api-response.ts) maps them to HTTP status codes and the
 * standard error envelope. Never expose SQL/driver errors to clients.
 */

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "DUPLICATE_SKU"
  | "DUPLICATE_CATEGORY"
  | "DUPLICATE_SALE_REQUEST"
  | "ALREADY_VOIDED"
  | "CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface StockShortage {
  productId: number;
  productName: string;
  requested: string;
  available: string;
  unit: string;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    status: number,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the submitted values.", details?: unknown) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHENTICATED", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("FORBIDDEN", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super("NOT_FOUND", 404, message);
  }
}

export class InsufficientStockError extends AppError {
  constructor(shortages: StockShortage[]) {
    const names = shortages.map((s) => s.productName).join(", ");
    super(
      "INSUFFICIENT_STOCK",
      409,
      `Not enough stock for: ${names}. Nothing was saved — adjust the quantities and try again.`,
      { shortages }
    );
  }
}

export class DuplicateSkuError extends AppError {
  constructor(sku: string) {
    super("DUPLICATE_SKU", 409, `SKU "${sku}" is already used by another product.`);
  }
}

export class DuplicateCategoryError extends AppError {
  constructor(name: string) {
    super("DUPLICATE_CATEGORY", 409, `A category named "${name}" already exists.`);
  }
}

export class DuplicateSaleRequestError extends AppError {
  constructor() {
    super("DUPLICATE_SALE_REQUEST", 409, "This sales entry was already saved.");
  }
}

export class AlreadyVoidedError extends AppError {
  constructor() {
    super("ALREADY_VOIDED", 409, "This sales entry has already been voided.");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super(
      "DATABASE_UNAVAILABLE",
      503,
      // On Render there is no XAMPP: don't tell the user to open it.
      process.env.NODE_ENV === "production"
        ? "The database is temporarily unavailable. Please wait a moment and try again."
        : "Cannot connect to the local database. Open XAMPP Control Panel and start MySQL, then retry.",
      undefined
    );
    if (cause) this.cause = cause;
  }
}

/** mysql2 error shape we care about. */
interface MysqlLikeError {
  code?: string;
  errno?: number;
}

/**
 * Errors that mean "the socket we were using is dead" (idle connection reaped
 * by Aiven / a NAT, DB restarted, ...). A fresh connection normally works.
 */
const STALE_CONNECTION_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

const STALE_CONNECTION_MESSAGES = [
  "Can't add new command when connection is in closed state",
  "Can't write in closed state",
];

export function isStaleConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && STALE_CONNECTION_CODES.has(code)) return true;
  return (
    typeof message === "string" &&
    STALE_CONNECTION_MESSAGES.some((text) => message.includes(text))
  );
}

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "PROTOCOL_CONNECTION_LOST",
  "ER_GET_CONNECTION_TIMEOUT",
  "ER_CON_COUNT_ERROR",
  "ER_SERVER_SHUTDOWN",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isStaleConnectionError(error)) return true;
  const code = (error as MysqlLikeError).code;
  return typeof code === "string" && CONNECTION_ERROR_CODES.has(code);
}

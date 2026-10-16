import { AppError, ValidationError } from "./errors";

/**
 * Date helpers. All business dates are calendar dates in the store timezone
 * (spec §3: Asia/Manila by default), never the server's local timezone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Manila";

/** "YYYY-MM-DD" for today in the store timezone. */
export function todayInStoreTz(tz: string = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** True when the string is a real calendar date (rejects 2026-02-31). */
export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

/** Validate + normalize a YYYY-MM-DD string, or throw a validation error. */
export function requireDateString(
  value: unknown,
  fieldName = "date"
): string {
  if (typeof value !== "string" || !isValidDateString(value)) {
    throw new ValidationError(`"${fieldName}" must be a valid date (YYYY-MM-DD).`, {
      field: fieldName,
    });
  }
  return value;
}

/** Add days to a YYYY-MM-DD string (timezone-safe; pure calendar math). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (compareDates(cursor, to) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Format a DB datetime (JS Date from mysql2, UTC) as "16 Oct 2026, 9:05 PM"
 * in the store timezone. Accepts Date or "YYYY-MM-DD HH:MM:SS" strings.
 */
export function formatDateTimeInStoreTz(
  value: Date | string,
  tz: string = APP_TIME_ZONE
): string {
  const date = value instanceof Date ? value : parseDbDatetime(value);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Format a calendar date as "Oct 16, 2026" (en-PH).
 * Accepts "YYYY-MM-DD", an ISO datetime string, or a Date — display-only
 * helper, so an unexpected value falls back to the raw text instead of
 * throwing RangeError and taking the whole page down.
 */
export function formatDateLong(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * mysql2 returns DATETIME as a Date object in the connection timezone.
 * With `timezone: "Z"` configured in the pool, these are UTC instants.
 */
function parseDbDatetime(value: string): Date {
  // "YYYY-MM-DD HH:MM:SS" (mysql2 string form, when not a Date) -> UTC.
  if (value.includes("T")) return new Date(value);
  return new Date(`${value.replace(" ", "T")}Z`);
}

/** Convert a mysql2 DATE value (string or Date) to "YYYY-MM-DD". */
export function dbDateToString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Convert a store-timezone calendar day to a UTC datetime string for SQL
 * comparisons. Asia/Manila is a fixed UTC+8 with no DST, and all supported
 * store timezones for this app are fixed-offset; this avoids MySQL's
 * CONVERT_TZ (which returns NULL unless the server's timezone tables are
 * loaded in MariaDB).
 * Returns e.g. "2026-10-15 16:00:00" for date "2026-10-16" 00:00 Manila.
 */
export function storeDayToUtcBoundary(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utcMillis = Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000;
  const utc = new Date(utcMillis);
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

/** Guard used by services: reject future sale dates. */
export function assertNotFutureDate(date: string): void {
  const today = todayInStoreTz();
  if (compareDates(date, today) > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      `"${date}" is in the future. Choose today or an earlier date.`
    );
  }
}

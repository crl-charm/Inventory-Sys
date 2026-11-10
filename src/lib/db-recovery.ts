import { isStaleConnectionError } from "./errors";
import { log, serializeError } from "./logger";

/**
 * Connection-recovery helpers for the mysql2 pool (src/lib/db.ts installs them).
 *
 * Rules that keep inventory data safe:
 *  1. Only plain reads (SELECT/SHOW) are ever re-run automatically, and only
 *     once, and only for "this socket was already dead" errors.
 *  2. Writes are NEVER re-run. If a write fails, the caller sees the error.
 *  3. Transactions are never replayed. We only (a) ping the connection BEFORE
 *     the transaction starts and (b) destroy a connection whose rollback fails.
 */

export function isReadOnlySql(sql: unknown): boolean {
  const text =
    typeof sql === "string"
      ? sql
      : sql && typeof sql === "object" && "sql" in sql
        ? String((sql as { sql: unknown }).sql)
        : "";
  // Strip leading whitespace and /* comments */ before looking at the verb.
  const verb = text.replace(/^(\s|\/\*[\s\S]*?\*\/)+/, "").slice(0, 8).toLowerCase();
  return verb.startsWith("select") || verb.startsWith("show");
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { code: "ETIMEDOUT" })),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Wrap pool.query / pool.execute: one re-run for reads that hit a dead socket. */
export function withReadRecovery<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  label: string
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (isStaleConnectionError(error) && isReadOnlySql(args[0])) {
        log("warn", "db_read_retry", { via: label, error: serializeError(error) });
        return await fn(...args);
      }
      throw error;
    }
  };
}

interface Pingable {
  ping(): Promise<void>;
  destroy(): void;
}

/**
 * Check out a connection and prove it is alive before handing it out
 * (the mysql2 equivalent of SQLAlchemy's pool_pre_ping). Dead ones are
 * destroyed — which also removes them from the pool — and replaced.
 * Nothing has been written yet at this point, so this is always safe.
 */
export async function getValidatedConnection<C extends Pingable>(
  checkout: () => Promise<C>,
  options: { attempts?: number; pingTimeoutMs?: number } = {}
): Promise<C> {
  const attempts = options.attempts ?? 3;
  const pingTimeoutMs = options.pingTimeoutMs ?? 5000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const connection = await checkout();
    try {
      await withTimeout(connection.ping(), pingTimeoutMs, "db ping");
      return connection;
    } catch (error) {
      lastError = error;
      log("warn", "db_stale_connection", { attempt, error: serializeError(error) });
      try {
        connection.destroy();
      } catch {
        // already gone
      }
    }
  }
  throw lastError;
}

interface Rollbackable {
  rollback(): Promise<void>;
  destroy(): void;
}

/**
 * Roll back inside a catch block WITHOUT hiding the original error. If the
 * rollback itself fails the connection is broken, so destroy it (MySQL rolls
 * back an abandoned transaction when the session ends). release() after
 * destroy() is a harmless no-op in mysql2.
 */
export async function safeRollback(connection: Rollbackable): Promise<void> {
  try {
    await withTimeout(connection.rollback(), 5000, "db rollback");
  } catch (error) {
    log("warn", "db_rollback_failed", { error: serializeError(error) });
    try {
      connection.destroy();
    } catch {
      // already gone
    }
  }
}

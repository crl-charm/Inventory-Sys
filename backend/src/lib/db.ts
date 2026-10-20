import mysql from "mysql2/promise";
import type { PoolConnection as CorePoolConnection } from "mysql2";
import {
  getValidatedConnection,
  withReadRecovery,
  withTimeout,
} from "./db-recovery";
import { log, serializeError } from "./logger";

/**
 * Shared mysql2 connection pool (spec §6, §11).
 *
 * - One pool for the whole process, cached on globalThis so Next.js hot
 *   reload in development does not leak pools.
 * - `decimalNumbers: false` keeps DECIMAL values as strings end-to-end so
 *   no money value is ever silently converted to an imprecise JS number.
 * - The browser never connects to MySQL; only server code imports this file.
 *
 * Reliability (Aiven / Render):
 * - connectTimeout: a dead DB host fails in seconds instead of hanging.
 * - enableKeepAlive + short idleTimeout/maxIdle: idle sockets are probed and
 *   retired before Aiven or a NAT silently drops them.
 * - pool.getConnection() pings before handing a connection out (pre-ping).
 * - pool.query()/execute(): plain SELECTs get ONE re-run on a dead socket;
 *   writes and transactions are never re-run (see db-recovery.ts).
 */

const globalForDb = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
};

const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string, fallback?: string): string {
  // In production there are NO silent localhost fallbacks: a missing DB_HOST
  // must fail loudly, not quietly connect to 127.0.0.1 on Render.
  const value = process.env[name] ?? (isProduction ? undefined : fallback);
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the Render dashboard (or copy backend/.env.example to backend/.env.local for local use).`
    );
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Managed MySQL providers (Aiven, DigitalOcean, TiDB, …) require TLS. Set
 * DB_SSL=true to encrypt the connection; optionally set DB_SSL_CA to the
 * provider's CA certificate (PEM text, real newlines or \n escapes) to also
 * verify the server certificate. Local XAMPP MySQL needs neither.
 */
function sslOption(): undefined | { ca?: string; rejectUnauthorized: boolean } {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_SSL_CA;
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: requireEnv("DB_HOST", "127.0.0.1"),
    port: Number(requireEnv("DB_PORT", "3306")),
    user: requireEnv("DB_USER", "root"),
    password: process.env.DB_PASSWORD ?? "",
    database: requireEnv("DB_NAME", "hardware_inventory"),
    ssl: sslOption(),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    decimalNumbers: false,
    timezone: "Z", // interpret DATETIME values as UTC
    charset: "utf8mb4_unicode_ci",
    connectTimeout: envInt("DB_CONNECT_TIMEOUT_MS", 10_000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    maxIdle: 2, // keep at most 2 idle sockets around...
    idleTimeout: 30_000, // ...and retire any idle socket after 30 s
  });
}

const isNewPool = !globalForDb.mysqlPool;
export const pool: mysql.Pool = globalForDb.mysqlPool ?? createPool();

if (isNewPool) {
  /**
   * Pin every new pooled connection to UTC. The `timezone: "Z"` option above
   * only tells mysql2 how to *parse* DATETIME values — it does not change the
   * database session timezone. Without this, `DEFAULT CURRENT_TIMESTAMP`
   * columns (created_at, updated_at) would be written in the server's local
   * wall time and then read back as if they were UTC (a +8h error for Manila).
   * This handler runs before the connection is handed out, so the SET is the
   * first statement executed on it.
   *
   * Runtime note: the promise pool re-emits the *core* pool's `connection`
   * event (`inheritEvents` in mysql2/lib/promise/pool.js), so `connection` is
   * the callback-style connection even though the typings say otherwise — use
   * the callback form, not promises, here.
   */
  pool.on("connection", (connection) => {
    const core = connection as unknown as CorePoolConnection;
    core.query("SET time_zone = '+00:00'", (error: unknown) => {
      if (error) {
        // Loud, but never fatal: a store clerk must still be able to record
        // sales. The acceptance suite asserts timestamps are true UTC, so a
        // silently broken timezone is caught there.
        log("error", "db_timezone_pin_failed", { error: serializeError(error) });
      }
    });
    // Server-side cap for runaway SELECTs (MySQL 5.7.8+/8.x; ignored if the
    // server does not support it). Separate statement so a failure here can
    // never undo the time-zone pin above.
    core.query(
      `SET SESSION max_execution_time = ${envInt("DB_QUERY_TIMEOUT_MS", 20_000)}`,
      () => undefined
    );
  });

  // Install recovery wrappers once. Services keep calling pool.query /
  // pool.execute / pool.getConnection exactly as before.
  const patchable = pool as unknown as Record<string, unknown>;
  const rawQuery = pool.query.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  const rawExecute = pool.execute.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  const rawGetConnection = pool.getConnection.bind(pool);
  patchable.query = withReadRecovery(rawQuery, "pool.query");
  patchable.execute = withReadRecovery(rawExecute, "pool.execute");
  patchable.getConnection = () => getValidatedConnection(rawGetConnection);
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = pool;
}

/** Check out a connection for a transaction; caller MUST release in finally. */
export async function getConnection(): Promise<mysql.PoolConnection> {
  return pool.getConnection();
}

/**
 * Cheap reachability probe for /ready and startup logs. Returns false
 * (never throws, never leaks the error) when the DB cannot answer in time.
 */
export async function pingDatabase(timeoutMs = 3000): Promise<boolean> {
  try {
    await withTimeout(pool.query("SELECT 1"), timeoutMs, "db readiness ping");
    return true;
  } catch (error) {
    log("warn", "db_ping_failed", { error: serializeError(error) });
    return false;
  }
}

/** Close the pool on shutdown (SIGTERM from Render). */
export async function closePool(): Promise<void> {
  await pool.end();
}

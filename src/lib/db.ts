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

const isCloudRuntime =
  process.env.RENDER === "true" &&
  process.env.NEXT_PHASE !== "phase-production-build";

function requireEnv(name: string, fallback?: string): string {
  // On Render at runtime there are NO silent localhost fallbacks: a missing
  // DB_HOST must fail loudly, not quietly connect to 127.0.0.1. During local
  // next build / next start (XAMPP), fallbacks keep the shop PC working.
  const value = process.env[name] ?? (isCloudRuntime ? undefined : fallback);
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the Render dashboard (or copy .env.example to .env.local for local use).`
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
  pool.on("connection", (connection) => {
    const core = connection as unknown as CorePoolConnection;
    core.query("SET time_zone = '+00:00'", (error: unknown) => {
      if (error) {
        log("error", "db_timezone_pin_failed", { error: serializeError(error) });
      }
    });
    core.query(
      `SET SESSION max_execution_time = ${envInt("DB_QUERY_TIMEOUT_MS", 20_000)}`,
      () => undefined
    );
  });

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

const READY_TTL_MS = 10_000;
let readyCheck: { at: number; result: Promise<boolean> } | null = null;

/**
 * Cached readiness check (10s TTL) shared across /ready and /api/wake so
 * concurrent probes never flood MySQL.
 */
export function isDatabaseReady(): Promise<boolean> {
  const now = Date.now();
  if (!readyCheck || now - readyCheck.at > READY_TTL_MS) {
    readyCheck = { at: now, result: pingDatabase(3000) };
  }
  return readyCheck.result;
}

/** Close the pool on shutdown. */
export async function closePool(): Promise<void> {
  await pool.end();
}

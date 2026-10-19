import mysql from "mysql2/promise";
import type { PoolConnection as CorePoolConnection } from "mysql2";

/**
 * Shared mysql2 connection pool (spec §6, §11).
 *
 * - One pool for the whole process, cached on globalThis so Next.js hot
 *   reload in development does not leak pools.
 * - `decimalNumbers: false` keeps DECIMAL values as strings end-to-end so
 *   no money value is ever silently converted to an imprecise JS number.
 * - The browser never connects to MySQL; only server code imports this file.
 */

const globalForDb = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
};

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable ${name}. Copy backend/.env.example to backend/.env.local and fill it in.`
    );
  }
  return value;
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

export const pool: mysql.Pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
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
  });

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
  (connection as unknown as CorePoolConnection).query(
    "SET time_zone = '+00:00'",
    (error: unknown) => {
      if (error) {
        // Loud, but never fatal: a store clerk must still be able to record
        // sales. The acceptance suite asserts timestamps are true UTC, so a
        // silently broken timezone is caught there.
        console.error(
          "[db] Failed to pin session time zone to UTC; DATETIME values may be wrong:",
          error
        );
      }
    }
  );
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = pool;
}

/** Check out a connection for a transaction; caller MUST release in finally. */
export async function getConnection(): Promise<mysql.PoolConnection> {
  return pool.getConnection();
}

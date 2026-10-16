import mysql from "mysql2/promise";

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
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const pool: mysql.Pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
    host: requireEnv("DB_HOST", "127.0.0.1"),
    port: Number(requireEnv("DB_PORT", "3306")),
    user: requireEnv("DB_USER", "root"),
    password: process.env.DB_PASSWORD ?? "",
    database: requireEnv("DB_NAME", "hardware_inventory"),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    decimalNumbers: false,
    timezone: "Z", // interpret DATETIME values as UTC
    charset: "utf8mb4_unicode_ci",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = pool;
}

/** Check out a connection for a transaction; caller MUST release in finally. */
export async function getConnection(): Promise<mysql.PoolConnection> {
  return pool.getConnection();
}

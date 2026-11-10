import "../src/load-env";

export interface DbScriptConfig {
  host: string;
  port: number;
  portRaw: string;
  user: string;
  password: string;
  database: string;
  sslEnabled: boolean;
  sslCaPem?: string;
  ssl: undefined | { ca?: string; rejectUnauthorized: boolean };
}

/**
 * Managed MySQL providers (Aiven, DigitalOcean, …) require TLS — same rules
 * as src/lib/db.ts: DB_SSL=true enables it, DB_SSL_CA (PEM) verifies the
 * server certificate.
 */
export function sslOption(): undefined | { ca?: string; rejectUnauthorized: boolean } {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_SSL_CA;
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Reads DB_* connection parameters after loading backend/.env.local and
 * backend/.env, defaulting to standard local XAMPP values.
 */
export function readDbScriptConfig(): DbScriptConfig {
  const sslEnabled = process.env.DB_SSL === "true";
  const rawCa = process.env.DB_SSL_CA;
  const sslCaPem = rawCa ? rawCa.replace(/\\n/g, "\n") : undefined;
  const portRaw = process.env.DB_PORT ?? "3306";
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(portRaw),
    portRaw,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "hardware_inventory",
    sslEnabled,
    sslCaPem,
    ssl: sslOption(),
  };
}


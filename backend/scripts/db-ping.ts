/**
 * npm run db:ping
 *
 * Quick connection check for the database configured by DB_* (.env.local /
 * .env / process env). Prints the server version, the connected user,
 * whether the session is encrypted (managed hosts like Aiven require TLS),
 * and whether DB_NAME exists. Use it before a first db:import to a new host:
 *
 *   $env:DB_HOST="..."; $env:DB_PORT="..."; $env:DB_USER="avnadmin"
 *   $env:DB_PASSWORD="..."; $env:DB_SSL="true"
 *   $env:DB_SSL_CA = Get-Content "$HOME\Downloads\ca.pem" -Raw
 *   npm run db:ping
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

loadEnvFile(".env.local");
loadEnvFile(".env");

function loadEnvFile(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Managed MySQL providers (Aiven, DigitalOcean, …) require TLS — same rules
 * as src/lib/db.ts: DB_SSL=true enables it, DB_SSL_CA (PEM) verifies the
 * server certificate.
 */
function sslOption(): undefined | { ca?: string; rejectUnauthorized: boolean } {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_SSL_CA;
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

async function main(): Promise<void> {
  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME ?? "hardware_inventory";

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      ssl: sslOption(),
    });
  } catch (error) {
    console.error(`✗ Cannot connect to ${host}:${port} as user "${user}".`);
    console.error(
      "  → Local: is MySQL running in the XAMPP Control Panel?\n" +
        "  → Remote: check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD;\n" +
        "    managed hosts (Aiven, DigitalOcean, …) also need DB_SSL=true."
    );
    console.error(error);
    process.exitCode = 1;
    return;
  }

  try {
    const [versionRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT VERSION() AS version, CURRENT_USER() AS connected_as"
    );
    const [sslRows] = await connection.query<mysql.RowDataPacket[]>(
      "SHOW SESSION STATUS LIKE 'Ssl_cipher'"
    );

    const row = versionRows[0];
    const cipher = String(sslRows[0]?.Value ?? "");

    console.log(`✓ Connected to ${host}:${port}`);
    if (row) {
      console.log(`  • Server:   ${row.version} (as ${row.connected_as})`);
    }
    let tlsLine = cipher ? `${cipher} (encrypted)` : "not encrypted";
    if (!cipher && process.env.DB_SSL === "true") {
      tlsLine += " — expected TLS; check DB_SSL / DB_SSL_CA";
    }
    console.log(`  • TLS:      ${tlsLine}`);

    try {
      await connection.changeUser({ database });
      console.log(`  • Database \`${database}\` found.`);
    } catch {
      console.log(
        `  • Database \`${database}\` MISSING — create it (Aiven console → Databases tab) or run db:init.`
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("✗ Connected, but the check queries failed:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

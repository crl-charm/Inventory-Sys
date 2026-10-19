/**
 * npm run db:seed-owner
 *
 * Creates or updates the single owner account. There is no public signup.
 *
 * Reads from .env.local (falling back to .env):
 *   SEED_OWNER_USERNAME  (default: owner)
 *   SEED_OWNER_PASSWORD  (default: generated once and printed below)
 *   SEED_OWNER_NAME      (default: Owner)
 *
 * Re-running with the same username updates that account's password.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

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

  const username = (process.env.SEED_OWNER_USERNAME ?? "owner").trim();
  const displayName = (process.env.SEED_OWNER_NAME ?? "Owner").trim();
  const generated = !process.env.SEED_OWNER_PASSWORD;
  const plainPassword =
    process.env.SEED_OWNER_PASSWORD ?? randomBytes(9).toString("base64url");

  if (username.length < 3) {
    console.error("✗ SEED_OWNER_USERNAME must be at least 3 characters.");
    process.exitCode = 1;
    return;
  }
  if (plainPassword.length < 8) {
    console.error("✗ SEED_OWNER_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password, database, ssl: sslOption() });
  } catch (error) {
    console.error(
      "✗ Cannot connect to the database. Start MySQL in the XAMPP Control Panel, " +
        "run `npm run db:init` first, and check .env.local.\n",
      error
    );
    process.exitCode = 1;
    return;
  }

  try {
    // Pin the session to UTC like the app pool (src/lib/db.ts) so the
    // account's created_at/updated_at values are stored in true UTC.
    await connection.query("SET time_zone = '+00:00'");
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    await connection.execute(
      `INSERT INTO users (username, password_hash, display_name, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name), is_active = 1`,
      [username, passwordHash, displayName]
    );

    console.log(`✓ Owner account "${username}" is ready.`);
    if (generated) {
      console.log("");
      console.log(`  Generated password: ${plainPassword}`);
      console.log("  Save it now — it is shown only this once.");
      console.log("  (Set SEED_OWNER_PASSWORD in .env.local to choose your own.)");
    } else {
      console.log("  Password taken from SEED_OWNER_PASSWORD in .env.local.");
    }
    console.log("");
    console.log("Next: npm run dev, then open http://localhost:3000");
  } catch (error) {
    console.error("✗ Failed to create the owner account:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

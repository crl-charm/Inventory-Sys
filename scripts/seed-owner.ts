/**
 * npm run db:seed-owner
 *
 * Creates or updates a user account — the owner by default, or a staff
 * account when SEED_OWNER_* is set to that person's details. There is no
 * public signup.
 *
 * Reads from .env.local (falling back to .env):
 *   SEED_OWNER_USERNAME  (default: owner)
 *   SEED_OWNER_PASSWORD  (default: generated once and printed below)
 *   SEED_OWNER_NAME      (default: Owner)
 *
 * Re-running with the same username updates that account's password.
 */
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { readDbScriptConfig } from "./db-config";

async function main(): Promise<void> {
  const { host, port, user, password, database, ssl } = readDbScriptConfig();

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
    connection = await mysql.createConnection({ host, port, user, password, database, ssl });
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
    console.log("Next: start backend & frontend (npm run dev:backend / npm run dev:frontend, or run-app.bat), then open http://localhost:3000");
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

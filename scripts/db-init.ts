/**
 * npm run db:init
 *
 * Creates the configured DB_NAME database (if missing) and applies
 * database/schema.sql. Safe to re-run: the schema is idempotent.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from .env.local
 * (falling back to .env), defaulting to the stock XAMPP values.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { readDbScriptConfig } from "./db-config";

async function main(): Promise<void> {
  const { host, port, user, password, database, ssl } = readDbScriptConfig();

  const schemaPath = resolve(process.cwd(), "database", "schema.sql");
  if (!existsSync(schemaPath)) {
    console.error(`✗ Cannot find ${schemaPath}`);
    process.exitCode = 1;
    return;
  }
  const schemaSql = readFileSync(schemaPath, "utf8");
  // The SQL file's server-level header is for manual phpMyAdmin imports.
  // Scripts select DB_NAME explicitly so managed/default databases work too.
  const tablesStart = schemaSql.indexOf("CREATE TABLE IF NOT EXISTS schema_migrations");
  if (tablesStart < 0) throw new Error("Could not find the schema's first table.");

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      ssl,
      multipleStatements: true,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ER_ACCESS_DENIED_ERROR"
    ) {
      console.error(
        "✗ Cannot connect to MySQL/MariaDB.\n" +
          "  → Open the XAMPP Control Panel and start MySQL (MariaDB).\n" +
          `  → Checked ${host}:${port} as user "${user}".\n` +
          "  → Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD in .env.local."
      );
    } else {
      console.error("✗ Connection failed:", error);
    }
    process.exitCode = 1;
    return;
  }

  try {
    try {
      await connection.query("USE ??", [database]);
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_BAD_DB_ERROR") throw error;
      await connection.query(
        "CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        [database]
      );
      await connection.query("USE ??", [database]);
    }
    // Pin the session to UTC like the app pool (src/lib/db.ts) so seeded
    // rows and DATETIME defaults carry true UTC values.
    await connection.query("SET time_zone = '+00:00'");
    await connection.query(schemaSql.slice(tablesStart));
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
      [database]
    );
    const tables = rows.map((row) => String(row.TABLE_NAME));
    console.log(`✓ Schema applied to database "${database}".`);
    console.log(`  Tables: ${tables.join(", ")}`);
    console.log("  Categories seeded (Engine Oil & Fluids, Tires, Mags & Wheels, Hardware, Other) if absent.");
    console.log("\nNext: npm run db:seed-owner");
  } catch (error) {
    console.error("✗ Failed to apply schema.sql:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

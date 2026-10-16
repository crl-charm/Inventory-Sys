/**
 * npm run db:init
 *
 * Creates the `hardware_inventory` database (if missing) and applies
 * database/schema.sql. Safe to re-run: the schema is idempotent.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from .env.local
 * (falling back to .env), defaulting to the stock XAMPP values.
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

async function main(): Promise<void> {
  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME ?? "hardware_inventory";

  const schemaPath = resolve(process.cwd(), "database", "schema.sql");
  if (!existsSync(schemaPath)) {
    console.error(`✗ Cannot find ${schemaPath}`);
    process.exitCode = 1;
    return;
  }
  const schemaSql = readFileSync(schemaPath, "utf8");

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
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
    await connection.query(schemaSql);
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

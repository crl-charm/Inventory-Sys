/**
 * npm run db:migrate
 *
 * Applies versioned database migrations, in order, exactly once each.
 * Applied versions are recorded in the `schema_migrations` table.
 *
 * Design rules:
 * - Every step is defensive (information_schema checks), so a partially
 *   applied migration can be resumed safely by re-running this command.
 * - Never loses data: new columns are added nullable, backfilled, then
 *   tightened to NOT NULL before the legacy column is dropped.
 * - Fresh installs (schema.sql already current) run this as a no-op.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from .env.local
 * (falling back to .env), defaulting to the stock XAMPP values.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

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

interface Migration {
  id: string;
  description: string;
  run(connection: mysql.Connection): Promise<string[]>;
}

async function listColumns(
  connection: mysql.Connection,
  table: string
): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return rows.map((row) => String(row.COLUMN_NAME));
}

async function listCheckConstraints(
  connection: mysql.Connection,
  table: string
): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        AND CONSTRAINT_TYPE = 'CHECK'`,
    [table]
  );
  return rows.map((row) => String(row.CONSTRAINT_NAME));
}

const migrations: Migration[] = [
  {
    id: "0001_sale_items_base_final_price",
    description:
      "sale_items keeps base_unit_price + final_unit_price snapshots (historical unit_price copied into both)",
    async run(connection): Promise<string[]> {
      const log: string[] = [];
      const columns = await listColumns(connection, "sale_items");
      const hasColumn = (name: string): boolean => columns.includes(name);

      // 1. Add the new snapshot columns (nullable first so history is never lost).
      if (!hasColumn("base_unit_price")) {
        await connection.query(
          "ALTER TABLE sale_items ADD COLUMN base_unit_price DECIMAL(12,2) NULL AFTER quantity"
        );
        log.push("added column sale_items.base_unit_price");
      }
      if (!hasColumn("final_unit_price")) {
        await connection.query(
          "ALTER TABLE sale_items ADD COLUMN final_unit_price DECIMAL(12,2) NULL AFTER base_unit_price"
        );
        log.push("added column sale_items.final_unit_price");
      }

      // 2. Backfill historical rows from the legacy column. For those rows the
      //    applied price was also the catalog price, so both snapshots get it.
      if (hasColumn("unit_price")) {
        const [backfill] = await connection.query<ResultSetHeader>(
          `UPDATE sale_items
              SET base_unit_price  = COALESCE(base_unit_price, unit_price),
                  final_unit_price = COALESCE(final_unit_price, unit_price)
            WHERE base_unit_price IS NULL OR final_unit_price IS NULL`
        );
        log.push(
          `backfilled ${backfill.affectedRows} historical row(s) from unit_price`
        );
      }

      // 3. Tighten to NOT NULL (no-op when already correct).
      await connection.query(
        "ALTER TABLE sale_items " +
          "MODIFY base_unit_price DECIMAL(12,2) NOT NULL, " +
          "MODIFY final_unit_price DECIMAL(12,2) NOT NULL"
      );
      log.push("enforced NOT NULL on both snapshot columns");

      // 4. Swap the old single-price CHECK for the two new non-negative checks.
      const checks = await listCheckConstraints(connection, "sale_items");
      if (checks.includes("chk_sale_items_price")) {
        await connection.query(
          "ALTER TABLE sale_items DROP CONSTRAINT chk_sale_items_price"
        );
        log.push("dropped legacy constraint chk_sale_items_price");
      }
      if (!checks.includes("chk_sale_items_base_price")) {
        await connection.query(
          "ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_base_price CHECK (base_unit_price >= 0)"
        );
        log.push("added constraint chk_sale_items_base_price");
      }
      if (!checks.includes("chk_sale_items_final_price")) {
        await connection.query(
          "ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_final_price CHECK (final_unit_price >= 0)"
        );
        log.push("added constraint chk_sale_items_final_price");
      }

      // 5. Drop the legacy column only now that both snapshots hold its values.
      if (hasColumn("unit_price")) {
        await connection.query(
          "ALTER TABLE sale_items DROP COLUMN unit_price"
        );
        log.push("dropped legacy column unit_price (values preserved above)");
      }

      return log;
    },
  },
];

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
      database,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ER_ACCESS_DENIED_ERROR" ||
      code === "ER_BAD_DB_ERROR"
    ) {
      console.error(
        "✗ Cannot connect to the app database.\n" +
          "  → Start MySQL in the XAMPP Control Panel and run `npm run db:init` first.\n" +
          `  → Checked ${host}:${port}, database "${database}".`
      );
    } else {
      console.error("✗ Connection failed:", error);
    }
    process.exitCode = 1;
    return;
  }

  try {
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items'`
    );
    if (tables.length === 0) {
      console.error(
        "✗ Table `sale_items` does not exist yet. Run `npm run db:init` first."
      );
      process.exitCode = 1;
      return;
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id VARCHAR(120) NOT NULL,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id)
       ) ENGINE=InnoDB`
    );

    const [appliedRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM schema_migrations"
    );
    const applied = new Set(appliedRows.map((row) => String(row.id)));

    let ran = 0;
    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        console.log(`• ${migration.id} — already applied`);
        continue;
      }
      console.log(`→ applying ${migration.id}: ${migration.description}`);
      const log = await migration.run(connection);
      for (const line of log) console.log(`    ${line}`);
      await connection.query("INSERT INTO schema_migrations (id) VALUES (?)", [
        migration.id,
      ]);
      console.log(`✓ ${migration.id} applied`);
      ran++;
    }

    console.log("");
    if (ran === 0) {
      console.log("✓ Database is up to date (no migrations to run).");
    } else {
      console.log(`✓ Applied ${ran} migration(s). Database is up to date.`);
    }
  } catch (error) {
    console.error("✗ Migration failed:", error);
    console.error(
      "  Re-running `npm run db:migrate` is safe — steps already done are skipped."
    );
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

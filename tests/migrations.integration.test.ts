import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { runMigrations, withTestDatabase } from "./db-fixture";

test("legacy price and local-time rows migrate once without losing history", async () => {
  await withTestDatabase(async ({ connection, env }) => {
    await connection.query("DELETE FROM schema_migrations");
    await connection.query("ALTER TABLE sale_batches DROP COLUMN request_hash");
    await connection.query("ALTER TABLE sale_items DROP CONSTRAINT chk_sale_items_base_price");
    await connection.query("ALTER TABLE sale_items DROP CONSTRAINT chk_sale_items_final_price");
    await connection.query(
      `ALTER TABLE sale_items
         DROP COLUMN base_unit_price, DROP COLUMN final_unit_price,
         ADD COLUMN unit_price DECIMAL(12,2) NOT NULL AFTER quantity`
    );
    await connection.query(
      "ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_price CHECK (unit_price >= 0)"
    );

    const [user] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (username, password_hash, display_name, created_at, updated_at)
       VALUES ('legacy', 'unused', 'Legacy', '2026-10-10 11:00:00', '2026-10-10 12:00:00')`
    );
    const [product] = await connection.execute<ResultSetHeader>(
      `INSERT INTO products (sku, name, category_id, unit, selling_price, reorder_level)
       VALUES ('LEGACY-1', 'Legacy Product', 1, 'piece', '3.25', '1')`
    );
    const [batch] = await connection.execute<ResultSetHeader>(
      `INSERT INTO sale_batches (sale_date, total_amount, created_by, created_at)
       VALUES ('2026-10-10', '8.13', ?, '2026-10-10 12:00:00')`,
      [user.insertId]
    );
    await connection.execute(
      `INSERT INTO sale_items
       (sale_batch_id, product_id, product_name_snapshot, unit_snapshot, quantity, unit_price, line_total)
       VALUES (?, ?, 'Legacy Product', 'piece', '2.500', '3.25', '8.13')`,
      [batch.insertId, product.insertId]
    );

    // Reapplying schema.sql to an existing installation must not mark its
    // pending historical timestamp shift as already done.
    const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
    const tablesStart = schema.indexOf("CREATE TABLE IF NOT EXISTS schema_migrations");
    await connection.query(schema.slice(tablesStart));
    const [baseline] = await connection.query<RowDataPacket[]>("SELECT id FROM schema_migrations");
    assert.equal(baseline.length, 0);

    await Promise.all([runMigrations(env), runMigrations(env)]);
    const [userTimes] = await connection.query<RowDataPacket[]>(
      "SELECT created_at, updated_at FROM users WHERE id = ?", [user.insertId]
    );
    assert.equal((userTimes[0]?.created_at as Date).toISOString().slice(0, 19), "2026-10-10T03:00:00");
    assert.equal((userTimes[0]?.updated_at as Date).toISOString().slice(0, 19), "2026-10-10T04:00:00");
    const [newMigrationTime] = await connection.query<RowDataPacket[]>(
      "SELECT ABS(TIMESTAMPDIFF(SECOND, applied_at, UTC_TIMESTAMP())) AS age FROM schema_migrations WHERE id = '0001_sale_items_base_final_price'"
    );
    assert.ok(Number(newMigrationTime[0]?.age) < 60, "new migration metadata is already UTC");
    const [items] = await connection.query<RowDataPacket[]>(
      "SELECT base_unit_price, final_unit_price, line_total FROM sale_items WHERE sale_batch_id = ?",
      [batch.insertId]
    );
    assert.equal(items[0]?.base_unit_price, "3.25");
    assert.equal(items[0]?.final_unit_price, "3.25");
    assert.equal(items[0]?.line_total, "8.13");
    const [oldColumn] = await connection.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM sale_items LIKE 'unit_price'"
    );
    assert.equal(oldColumn.length, 0);

    const [beforeRerun] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM sale_batches WHERE id = ?",
      [batch.insertId]
    );
    assert.equal((beforeRerun[0]?.created_at as Date).toISOString().slice(0, 19), "2026-10-10T04:00:00");
    await runMigrations(env);
    const [afterRerun] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM sale_batches WHERE id = ?",
      [batch.insertId]
    );
    assert.equal(
      (afterRerun[0]?.created_at as Date).toISOString(),
      (beforeRerun[0]?.created_at as Date).toISOString()
    );
    const [versions] = await connection.query<RowDataPacket[]>("SELECT id FROM schema_migrations");
    assert.equal(versions.length, 3);
    const [requestHashColumn] = await connection.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM sale_batches LIKE 'request_hash'"
    );
    assert.equal(requestHashColumn.length, 1);
  });
});

test("deployment schema check rejects missing migrations and columns without changing data", async () => {
  await withTestDatabase(async ({ connection, env }) => {
    await runMigrations(env, ["--check"]);
    await connection.query("ALTER TABLE sale_batches DROP COLUMN request_hash");
    await assert.rejects(runMigrations(env, ["--check"]));
    const [columns] = await connection.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM sale_batches LIKE 'request_hash'"
    );
    assert.equal(columns.length, 0);
    await connection.query("DELETE FROM schema_migrations WHERE id = '0003_sale_request_hash'");
    await runMigrations(env);
    await runMigrations(env, ["--check"]);
  });
});

test("current schema without a UTC marker requires a timezone decision", async () => {
  await withTestDatabase(async ({ connection, env }) => {
    await connection.query("DELETE FROM schema_migrations");
    const [before] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM categories WHERE id = 1"
    );
    await assert.rejects(runMigrations(env));
    await connection.query(
      "INSERT INTO schema_migrations (id) VALUES ('0001_sale_items_base_final_price')"
    );
    await assert.rejects(runMigrations(env));
    await runMigrations(env, ["--already-utc"]);
    const [after] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM categories WHERE id = 1"
    );
    assert.equal(
      (after[0]?.created_at as Date).toISOString(),
      (before[0]?.created_at as Date).toISOString()
    );
    const [versions] = await connection.query<RowDataPacket[]>("SELECT id FROM schema_migrations");
    assert.equal(versions.length, 3);
  });
});

test("explicit legacy-local choice shifts unmarked timestamps once", async () => {
  await withTestDatabase(async ({ connection, env }) => {
    await connection.query("DELETE FROM schema_migrations");
    const [before] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM categories WHERE id = 1"
    );
    await runMigrations(env, ["--legacy-local-datetimes"]);
    const [after] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM categories WHERE id = 1"
    );
    assert.equal(
      (after[0]?.created_at as Date).getTime(),
      (before[0]?.created_at as Date).getTime() - 8 * 60 * 60 * 1000
    );
    await runMigrations(env);
    const [rerun] = await connection.query<RowDataPacket[]>(
      "SELECT created_at FROM categories WHERE id = 1"
    );
    assert.equal(
      (rerun[0]?.created_at as Date).toISOString(),
      (after[0]?.created_at as Date).toISOString()
    );
  });
});

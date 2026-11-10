import assert from "node:assert/strict";
import { mkdtemp, readdir, rmdir, unlink, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { runDbScript, withTestDatabase } from "./db-fixture";

test("database tools honor the configured schema and reject multi-database imports", async () => {
  await withTestDatabase(async ({ connection, env, name }) => {
    await connection.query("DROP DATABASE ??", [name]);
    await runDbScript("db-init.ts", env);
    await connection.query("USE ??", [name]);
    await runDbScript("db-init.ts", env);
    const [categories] = await connection.query<RowDataPacket[]>("SELECT id FROM categories");
    assert.equal(categories.length, 5);

    const directory = await mkdtemp(join(tmpdir(), "inventory-import-test-"));
    const dump = join(directory, "shop.sql");
    try {
      await writeFile(dump, "CREATE DATABASE /*!32312 IF NOT EXISTS*/ `previous_shop`;\nUSE `previous_shop`;\nCREATE TABLE import_probe (note TEXT);\nINSERT INTO import_probe VALUES ('original');\n");
      await runDbScript("db-import.ts", env, [dump]);
      const [rows] = await connection.query<RowDataPacket[]>("SELECT note FROM import_probe");
      assert.equal(rows[0]?.note, "original");
      await writeFile(dump, "CREATE TABLE must_not_exist (id INT);\nUSE `one`;\nUSE `two`;\n");
      await assert.rejects(runDbScript("db-import.ts", env, [dump]));
      const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES LIKE 'must_not_exist'");
      assert.equal(tables.length, 0);

      const executable = process.env.TEST_MYSQL_DUMP_PATH;
      if (executable) {
        const backupEnv = { ...env, MYSQL_DUMP_PATH: executable };
        const old = join(directory, `${name}_2000-01-01T00-00-00-000Z.sql`);
        await writeFile(old, "old app backup");
        await utimes(old, new Date(0), new Date(0));
        await runDbScript("db-backup.ts", backupEnv, ["--output-dir", directory]);
        const backups = (await readdir(directory)).filter((file) => file.startsWith(`${name}_`) && file.endsWith(".sql"));
        assert.equal(backups.length, 1, "retention removes only old app backups");
        await runDbScript("db-backup.ts", backupEnv, ["--output-dir", directory, "--daily"]);
        assert.equal((await readdir(directory)).filter((file) => file.startsWith(`${name}_`)).length, 1);
        await connection.query("UPDATE import_probe SET note = 'after backup'");
        await runDbScript("db-import.ts", env, [join(directory, backups[0]!)]);
        const [restored] = await connection.query<RowDataPacket[]>("SELECT note FROM import_probe");
        assert.equal(restored[0]?.note, "original");
      }
    } finally {
      for (const file of await readdir(directory)) await unlink(join(directory, file));
      await rmdir(directory);
    }
  });
});

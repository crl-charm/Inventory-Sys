import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mysql, { type Connection } from "mysql2/promise";

const execFileAsync = promisify(execFile);
const backendDir = fileURLToPath(new URL("../", import.meta.url));

export interface TestDatabase {
  connection: Connection;
  name: string;
  env: NodeJS.ProcessEnv;
}

/** Only a dedicated loopback server on port 3307 may host these tests. */
export async function withTestDatabase(
  run: (database: TestDatabase) => Promise<void>
): Promise<void> {
  const host = process.env.TEST_DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.TEST_DB_PORT);
  const user = process.env.TEST_DB_USER ?? "root";
  const password = process.env.TEST_DB_PASSWORD;
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(host), "TEST_DB_HOST must be loopback");
  assert.equal(port, 3307, "TEST_DB_PORT must be the dedicated test port 3307");
  assert.ok(password, "Set TEST_DB_PASSWORD for the disposable database server");

  const name = `inventory_test_${randomBytes(8).toString("hex")}`;
  const admin = await mysql.createConnection({ host, port, user, password });
  let connection: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    connection = await mysql.createConnection({
      host, port, user, password, database: name, multipleStatements: true,
      decimalNumbers: false, timezone: "Z",
    });
    await connection.query("SET time_zone = '+00:00'");

    // schema.sql's CREATE DATABASE/USE header targets the real app database.
    const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
    const tablesStart = schema.indexOf("CREATE TABLE IF NOT EXISTS schema_migrations");
    assert.ok(tablesStart >= 0, "Could not find the schema's first table");
    await connection.query(schema.slice(tablesStart));

    const env = {
      ...process.env,
      DB_HOST: host,
      DB_PORT: String(port),
      DB_USER: user,
      DB_PASSWORD: password,
      DB_NAME: name,
      DB_SSL: "false",
      NODE_ENV: "test" as const,
    };
    Object.assign(process.env, env);
    await run({ connection, name, env });
  } finally {
    try {
      await connection?.end();
    } finally {
      try {
        if (created) await admin.query(`DROP DATABASE \`${name}\``);
      } finally {
        await admin.end();
      }
    }
  }
}

export async function runDbScript(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  return execFileAsync(process.execPath, ["--import", "tsx", `scripts/${script}`, ...args], {
    cwd: backendDir,
    env,
    timeout: 60_000,
  });
}

export async function runMigrations(env: NodeJS.ProcessEnv, args: string[] = []): Promise<void> {
  await runDbScript("db-migrate.ts", env, args);
}

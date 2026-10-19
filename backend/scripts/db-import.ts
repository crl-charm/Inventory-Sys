/**
 * npm run db:import -- <path-to-dump.sql>
 *
 * Loads a mysqldump file (as produced by scripts/backup-db.bat) into the
 * database server configured by DB_* (.env.local / .env / process env).
 * Use it to restore a backup, or to move the shop's data onto a managed
 * MySQL host (Aiven, DigitalOcean, …) — set DB_SSL=true (and DB_SSL_CA)
 * there, same rules as src/lib/db.ts.
 *
 * The dump contains CREATE DATABASE / USE / DROP TABLE / CREATE TABLE /
 * INSERT statements, so importing REPLACES every table the dump contains.
 * If the server user cannot create databases, create the database first
 * (e.g. in the provider's console) — "CREATE DATABASE IF NOT EXISTS" then
 * simply clears that step.
 *
 * Optional: `--database <name>` redirects the dump into a different database
 * than the one embedded in the file — for providers that only offer a fixed
 * database (Aiven's free plan: `defaultdb`). In that mode the dump's
 * CREATE DATABASE is skipped (the target must already exist) and its USE
 * statement is rewritten to the target.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL / DB_SSL_CA from
 * .env.local (falling back to .env); the process environment wins, so a
 * one-off import can override everything, e.g. in PowerShell:
 *   $env:DB_HOST="..."; $env:DB_SSL="true"; npm run db:import -- ..\backups\file.sql
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
  const args = process.argv.slice(2);

  let dumpArg: string | undefined;
  let targetDatabase: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--database") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        console.error("✗ --database needs a name, e.g. --database defaultdb");
        process.exitCode = 1;
        return;
      }
      targetDatabase = value;
      i++;
    } else if (arg?.startsWith("--database=")) {
      targetDatabase = arg.slice("--database=".length);
    } else if (arg && !dumpArg) {
      dumpArg = arg;
    }
  }

  if (!dumpArg) {
    console.error(
      "Usage: npm run db:import -- <path-to-dump.sql> [--database <name>]"
    );
    process.exitCode = 1;
    return;
  }
  if (targetDatabase !== undefined && !/^[A-Za-z0-9_$]+$/.test(targetDatabase)) {
    console.error(
      `✗ Invalid database name "${targetDatabase}" (letters, digits, _ and $ only).`
    );
    process.exitCode = 1;
    return;
  }

  const dumpPath = resolve(process.cwd(), dumpArg);
  if (!existsSync(dumpPath)) {
    console.error(`✗ Dump file not found: ${dumpPath}`);
    process.exitCode = 1;
    return;
  }

  let sqlText = readFileSync(dumpPath, "utf8");
  if (/^\s*DELIMITER /m.test(sqlText)) {
    console.error(
      "✗ This dump contains DELIMITER blocks (stored routines/triggers);\n" +
        "  import it with the mysql command-line client instead."
    );
    process.exitCode = 1;
    return;
  }

  if (targetDatabase !== undefined) {
    const useStatement = /^USE `[^`]+`;$/m;
    if (!useStatement.test(sqlText)) {
      console.error(
        "✗ --database was given, but the dump has no USE statement to redirect\n" +
          "  (it was probably made without mysqldump --databases)."
      );
      process.exitCode = 1;
      return;
    }
    // Land the dump in the provider's database: skip its CREATE DATABASE
    // (the target already exists — free plans may forbid creating more)
    // and point USE at the target.
    sqlText = sqlText
      .replace(
        /^CREATE DATABASE .*;$/m,
        "-- CREATE DATABASE skipped: target database already exists (--database given)"
      )
      .replace(useStatement, () => `USE \`${targetDatabase}\`;`);
  }

  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      ssl: sslOption(),
      multipleStatements: true,
    });
  } catch (error) {
    console.error(
      `✗ Cannot connect to ${host}:${port} as user "${user}".\n` +
        "  → Local: is MySQL running in the XAMPP Control Panel?\n" +
        "  → Remote: check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD and set\n" +
        "    DB_SSL=true for managed hosts (Aiven, DigitalOcean, …)."
    );
    console.error(error);
    process.exitCode = 1;
    return;
  }

  try {
    console.log(`Importing ${dumpPath}`);
    console.log(
      targetDatabase !== undefined
        ? `  into ${host}:${port} / \`${targetDatabase}\` ...`
        : `  into ${host}:${port} ...`
    );
    // The dump is a single stream of ;-separated statements (routines and
    // triggers were rejected above), so one multi-statement query applies
    // the whole file in order.
    await connection.query(sqlText);

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM users) AS users, " +
        "(SELECT COUNT(*) FROM products) AS products, " +
        "(SELECT COUNT(*) FROM sale_batches) AS sales"
    );
    const row = rows[0];
    if (row) {
      console.log(
        `✓ Import finished. users=${row.users}, products=${row.products}, ` +
          `sale_batches=${row.sales}`
      );
    } else {
      console.log("✓ Import finished.");
    }
  } catch (error) {
    console.error(
      "✗ Import failed part-way through. The database may hold a mix of old\n" +
        "  and new tables — fix the error and run the import again.\n",
      error
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

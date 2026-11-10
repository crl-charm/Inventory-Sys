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
 * The configured DB_NAME must already exist. Database headers in a supported
 * single-database dump are removed to keep normal backups on that target.
 * A dump is executable SQL: import only trusted backups with a user scoped
 * to the intended database.
 *
 * Optional: `--database <name>` overrides DB_NAME for this import.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL / DB_SSL_CA from
 * .env.local (falling back to .env); the process environment wins, so a
 * one-off import can override everything, e.g. in PowerShell:
 *   $env:DB_HOST="..."; $env:DB_SSL="true"; npm run db:import -- ..\backups\file.sql
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { readDbScriptConfig } from "./db-config";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { host, port, user, password, database: defaultDatabase, ssl } = readDbScriptConfig();

  let dumpArg: string | undefined;
  let targetDatabase = defaultDatabase;
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
    } else if (arg && !arg.startsWith("--") && !dumpArg) {
      dumpArg = arg;
    } else {
      console.error(`✗ Unexpected argument: ${arg}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!dumpArg) {
    console.error(
      "Usage: npm run db:import -- <path-to-dump.sql> [--database <name>]"
    );
    process.exitCode = 1;
    return;
  }
  if (!/^[A-Za-z0-9_$]{1,64}$/.test(targetDatabase)) {
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
  if (/^\s*DELIMITER\b/im.test(sqlText)) {
    console.error(
      "✗ This dump contains DELIMITER blocks (stored routines/triggers);\n" +
        "  import it with the mysql command-line client instead."
    );
    process.exitCode = 1;
    return;
  }

  // Accept normal mysqldump headers, including versioned CREATE options.
  // Refuse multiple databases rather than redirecting just the first header.
  const createDatabase = /^[ \t]*CREATE[ \t]+DATABASE[ \t]+[^;\r\n]*;[ \t]*\r?$/gim;
  const useDatabase = /^[ \t]*USE[ \t]+(?:`(?:``|[^`])+`|[A-Za-z0-9_$]+)[ \t]*;[ \t]*\r?$/gim;
  if ([...sqlText.matchAll(createDatabase)].length > 1 || [...sqlText.matchAll(useDatabase)].length > 1) {
    console.error("✗ Import one database at a time; this dump has multiple database headers.");
    process.exitCode = 1;
    return;
  }
  sqlText = sqlText
    .replace(createDatabase, "-- CREATE DATABASE skipped; target selected by DB_NAME/--database")
    .replace(useDatabase, "-- USE skipped; target selected by DB_NAME/--database");
  if (/^[ \t]*(?:(?:CREATE|ALTER|DROP)[ \t]+DATABASE\b|USE\b)/im.test(sqlText)) {
    console.error("✗ Unsupported database-selection statement; use a standard single-database mysqldump.");
    process.exitCode = 1;
    return;
  }

  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: targetDatabase,
      ssl,
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
    console.log(`  into ${host}:${port} / \`${targetDatabase}\` ...`);
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

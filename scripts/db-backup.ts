import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readDbScriptConfig } from "./db-config";

const execFileAsync = promisify(execFile);
const defaultDirectory = fileURLToPath(new URL("../backups/", import.meta.url));

async function main(): Promise<void> {
  let directory = defaultDirectory;
  let daily = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--daily") daily = true;
    else if (args[i] === "--output-dir" && args[i + 1]) directory = resolve(args[++i]!);
    else throw new Error("Usage: npm run db:backup -- [--daily] [--output-dir <directory>]");
  }
  const { host, portRaw, user, password, database, sslEnabled, sslCaPem } = readDbScriptConfig();
  if (!/^[A-Za-z0-9_$]{1,64}$/.test(database)) throw new Error("DB_NAME is invalid.");
  await mkdir(directory, { recursive: true });
  const backups = (await readdir(directory, { withFileTypes: true }))
    .filter((file) => file.isFile() && file.name.startsWith(`${database}_`) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sql$/.test(file.name.slice(database.length + 1)));
  if (daily) {
    for (const file of backups) {
      if ((await stat(join(directory, file.name))).mtime.toDateString() === new Date().toDateString()) {
        console.log("✓ Today's database backup already exists.");
        return;
      }
    }
  }

  const candidates = process.env.MYSQL_DUMP_PATH ? [process.env.MYSQL_DUMP_PATH] :
    process.platform === "win32" ? ["C:\\xampp1\\mysql\\bin\\mysqldump.exe", "mariadb-dump.exe", "mysqldump.exe"] :
      ["mariadb-dump", "mysqldump"];
  let executable: string | undefined;
  let mariaDb = false;
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      executable = candidate;
      mariaDb = /mariadb/i.test(stdout);
      break;
    } catch { /* Try the next installed dump client. */ }
  }
  if (!executable) throw new Error("Install mariadb-dump/mysqldump or set MYSQL_DUMP_PATH to its executable.");

  const temporary = await mkdtemp(join(tmpdir(), "inventory-backup-"));
  const configPath = join(temporary, "client.cnf");
  const caPath = join(temporary, "ca.pem");
  const output = join(directory, `${database}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  const partial = `${output}.partial`;
  const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
  try {
    // Keep credentials out of command arguments and use only this config.
    const options = ["[client]", "protocol=tcp",
      `host=${quote(host)}`,
      `port=${quote(portRaw)}`,
      `user=${quote(user)}`,
      `password=${quote(password)}`];
    if (sslEnabled && sslCaPem) {
      await writeFile(caPath, sslCaPem, { mode: 0o600 });
      options.push(`ssl-ca=${quote(caPath)}`);
    }
    if (mariaDb) {
      options.push(sslEnabled ? "ssl" : "skip-ssl");
      if (sslEnabled && sslCaPem) options.push("ssl-verify-server-cert");
    } else options.push(`ssl-mode=${sslEnabled ? sslCaPem ? "VERIFY_IDENTITY" : "REQUIRED" : "DISABLED"}`);
    await writeFile(configPath, options.join("\n") + "\n", { mode: 0o600 });
    const dump = spawn(executable, [`--defaults-file=${configPath}`, "--single-transaction", "--skip-add-locks",
      "--routines", "--triggers", "--events", "--databases", database], { windowsHide: true });
    let stderr = "";
    dump.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000); });
    const finished = new Promise<void>((resolveExit, reject) => {
      dump.once("error", reject);
      dump.once("close", (code) => code === 0 ? resolveExit() : reject(new Error(`Backup failed: ${stderr.trim() || `exit ${code}`}`)));
    });
    const writing = pipeline(dump.stdout, createWriteStream(partial, { flags: "wx", mode: 0o600 }));
    try { await Promise.all([finished, writing]); }
    catch (error) { dump.kill(); await writing.catch(() => undefined); throw error; }
    if ((await stat(partial)).size === 0) throw new Error("The dump client produced an empty backup.");
    await rename(partial, output);
    console.log(`✓ Database backup written: ${output}`);
    // Retention applies only to finalized files created by this command.
    for (const file of backups) {
      const path = join(directory, file.name);
      if ((await stat(path)).mtimeMs < Date.now() - 14 * 24 * 60 * 60 * 1000) await unlink(path);
    }
  } finally {
    await unlink(partial).catch(() => undefined);
    await unlink(configPath).catch(() => undefined);
    await unlink(caPath).catch(() => undefined);
    await rmdir(temporary);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database backup failed.");
  process.exitCode = 1;
});

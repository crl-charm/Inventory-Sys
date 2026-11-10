# Database setup (XAMPP / MariaDB)

This app expects a MySQL-compatible server. XAMPP currently ships **MariaDB**,
which is what this project was tested against (MariaDB 10.4.32, XAMPP).
MariaDB 10.4+ **enforces** the `CHECK` constraints in `schema.sql`.

## 1. Start the database

1. Open the **XAMPP Control Panel**.
2. Start **MySQL** (MariaDB). Apache is not required by this app.
3. The server should listen on `127.0.0.1:3306`. If 3306 is taken by another
   service, change it in `xampp\mysql\bin\my.ini` and update `DB_PORT` in `.env.local`.

## 2. Create the schema

Option A — script (recommended):

```powershell
npm run db:init
```

This reads `.env.local`, creates the configured `DB_NAME` database if needed,
and applies `database/schema.sql`. Re-running it is safe (idempotent).

Then apply any pending migrations:

```powershell
npm run db:migrate
```

Versioned migrations are recorded in the `schema_migrations` table and every
step is idempotent, so re-running is always safe. On a fresh install this is a
no-op; on an existing database it upgrades in place without losing data.
Run migrations before starting an updated backend; the sales API now uses the
`request_hash` column added by migration `0003_sale_request_hash`.
`npm run db:check` verifies compatibility without changing data; `npm start`
runs that check before starting the API. Migration runners serialize on a
database-specific lock so simultaneous deployments cannot race their DDL.

If an existing database has the current table layout but no `0002` migration record,
the script cannot infer whether its stored timestamps are UTC or old UTC+8
local time. It stops without changing data. After checking the displayed times,
run `npm run db:migrate -- --already-utc` to preserve them or
`npm run db:migrate -- --legacy-local-datetimes` to shift them once.

Option B — phpMyAdmin:

1. Open `http://localhost/phpmyadmin` (start **Apache** in XAMPP for this).
2. Click **Import**, choose `database/schema.sql`, and run it.

## 3. Database user

The app works with the XAMPP defaults (`root`, empty password). For a slightly
tighter setup, create a dedicated user in phpMyAdmin → SQL:

```sql
CREATE USER 'inventory_app'@'localhost' IDENTIFIED BY 'pick-a-local-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON hardware_inventory.* TO 'inventory_app'@'localhost';
FLUSH PRIVILEGES;
```

Then set `DB_USER` / `DB_PASSWORD` in `.env.local` accordingly.

> The app needs `SELECT, INSERT, UPDATE, DELETE` only at runtime. Running the
> schema script needs `CREATE` on the database (root or phpMyAdmin import is fine).

## 4. Create the owner account

```powershell
npm run db:seed-owner
```

Reads `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` from `.env.local` if present,
otherwise creates `owner` with a random password printed once to the console.
There is no public sign-up.

## 5. Backups

Stop app writes before an upgrade, then back up the configured database:

```powershell
npm run db:backup
npm run db:migrate
npm run db:check
```

The backup command uses `DB_*` (including TLS), stores credentials in a temporary
private option file, and finalizes `.sql` output only after the dump client
succeeds. It uses MariaDB/MySQL's native dump client; set `MYSQL_DUMP_PATH` if
it is not installed on PATH or in `C:\xampp1\mysql\bin`. Finalized dumps go to
the repo's `backups/` directory with 14-day retention. Use `--output-dir <path>`
to choose another directory. Restore a trusted single-database dump with:

```powershell
npm run db:import -- "..\backups\<DB_NAME>_<timestamp>.sql"
```

Import targets `DB_NAME` unless `--database <name>` overrides it. Standard
mysqldump database headers are removed, multi-database dumps are rejected,
and routine/trigger `DELIMITER` blocks require the native mysql client.
Keep off-machine backup copies and verify restores in a disposable database.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| App shows "Cannot connect to the local database…" | Open XAMPP Control Panel, start MySQL, retry. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL service not running, or wrong port in `.env.local`. |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `.env.local`. |
| `Unknown database 'hardware_inventory'` | Run `npm run db:init`. |
| `Unknown column 'base_unit_price'`-style errors after an update | Run `npm run db:migrate` to upgrade an older database. |
| Port 3306 busy | Change port in `my.ini` + `.env.local`, restart MySQL. |

Never expose phpMyAdmin or port 3306 to the public internet.

# Hardware Store Inventory & Daily Sales

Replace the notebook: record what was sold at the end of the day, and the app
deducts stock, totals the day's revenue, and keeps a full audit trail.

Built to `hardware_store_inventory_agent_spec.md` (Next.js 16 full-stack App Router + TypeScript + Tailwind + MySQL/MariaDB via XAMPP, `mysql2`).

The entire application — UI pages, Server Components, `/api/*` Route Handlers, and database scripts — runs as a **single unified service** at the repository root.

---

## What it does

- **Product catalog** — categories, unit, selling price, starting stock, reorder level.
- **Record Daily Sales** — enter quantities for the day in one batch. Each line
  shows a read-only **Base Price** (from the catalog) and an editable **Final
  Price** (the amount actually charged — change it when you gave a different
  price). Line totals use the Final Price; the app checks stock, saves the
  whole entry or nothing, and deducts inventory immediately.
- **Inventory** — current stock with In stock / Low / Out of stock status,
  search, filters, Stock In, and Physical Count correction.
- **Sales History** — every entry including voided ones; void with a reason
  restores stock and keeps the original record for audit.
- **Daily Report** — one day's totals, per-product quantities with units,
  voided entries listed separately, print-friendly.
- **Stock Movements** — the permanent ledger: every change with before/after,
  reason, and the related sale entry.

Not a POS: it records end-of-day totals, not per-customer receipts.

---

## Requirements

- Windows with [XAMPP](https://www.apachefriends.org/) installed (MySQL/MariaDB)
- Node.js 20 LTS or newer (`node --version`)

---

## First-time setup

1. **Start MySQL** — open the XAMPP Control Panel and start **MySQL** (Apache
   is not required).

2. **Install dependencies**

   ```powershell
   npm install
   ```

3. **Create environment file** — copy `.env.example` to `.env.local`.
   Defaults match a stock XAMPP install (`root`, empty password). Generate a
   secret for `AUTH_SECRET`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Create the database and tables**

   ```powershell
   npm run db:init      # creates hardware_inventory + applies database/schema.sql
   npm run db:migrate   # applies versioned migrations (no-op on a fresh install)
   ```

   `db:init` creates `hardware_inventory`, applies `database/schema.sql`,
   and seeds the starting categories. `db:migrate` upgrades an existing database
   in place and is safe to re-run. (Alternatively import the schema via
   phpMyAdmin — see `database/README.md`.)

5. **Create the owner account** (no public sign-up exists)

   ```powershell
   npm run db:seed-owner
   ```

   Uses `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` from `.env.local`
   when set; otherwise creates `owner` and prints a generated password **once**.
   Re-run any time to change the password. To add an **additional account**
   (staff), set `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` /
   `SEED_OWNER_NAME` to that person's details and run it again — each
   username is its own row. (Against the cloud database, also set the
   `DB_*` variables from the Render section, including `DB_SSL`.)

6. **Run the app** — easiest is to double-click **`run-app.bat`** in the repo
   root. It checks MySQL, takes the day's backup, starts the unified server
   window, waits until it answers, and opens the browser (it builds the app
   first if `.next` is missing).

   Manual alternative:

   ```powershell
   npm run dev     # Development server at http://localhost:3000
   # or
   npm start       # Production server (checks schema + starts on port 3000)
   ```

   Open <http://localhost:3000> and sign in.

   After new code arrives (`git pull`), double-click **`update-app.bat`** to
   pull, install, migrate, and rebuild — then start the app again.

## Daily use

1. **Inventory → Add product** for each item you sell (unit, price, starting
   stock, reorder level).
2. At closing, open **Record Daily Sales**, confirm the date, search each
   product, type the quantity, adjust the **Final Price** if the amount you
   charged differs from the catalog **Base Price**, and press **Save Sales &
   Update Inventory**.
3. Check the **Dashboard** for the day's totals and low-stock items.
4. Print the **Daily Report** if you want a paper copy.

Made a mistake after saving? Open the entry and **Void** it with a reason —
stock is restored automatically — then record the corrected entry.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the unified app (UI + API) in development mode on port 3000 |
| `npm run build` | Build the production Next.js bundle |
| `npm start` | Verify schema compatibility (`db:check`) and start the production server on port 3000 |
| `npm run db:init` | Create DB + apply `database/schema.sql` (safe to re-run) |
| `npm run db:migrate` | Apply versioned migrations to an existing database (safe to re-run) |
| `npm run db:check` | Verify schema compatibility without changing the database |
| `npm run db:backup` | Back up the configured database; keep finalized dumps for 14 days |
| `npm run db:import -- <dump.sql> [--database <name>]` | Load a dump into the configured database (local or cloud; obeys `DB_SSL`) |
| `npm run db:ping` | Check the configured database connection (server, TLS, database exists) |
| `npm run db:seed-owner` | Create/update an account (owner or staff) |
| `npm run icons` | Regenerate favicon + PWA icons from `public/logo.svg` |
| `powershell -ExecutionPolicy Bypass -File scripts\acceptance.ps1` | End-to-end checks (mutates data; needs the app server running) |
| `run-app.bat` (double-click) | MySQL check → daily backup → app server → browser |
| `update-app.bat` (double-click) | Backup → fast-forward pull → install → migrate → rebuild |
| `scripts\backup-db.bat` | Take a database dump now (kept 14 days) |
| `scripts\restore-db.bat <dump.sql>` | Restore a dump (asks to confirm) |

### Tests

Run `npm test`, `npm run typecheck`, and `npm run lint` from the repository root.
`npm run test:integration` needs a dedicated local MariaDB server on port 3307.
Set `TEST_DB_HOST` (loopback), `TEST_DB_PORT=3307`, `TEST_DB_USER`, and
`TEST_DB_PASSWORD` before running it. Each test creates and drops a randomly
named database on that server. CI starts this disposable server automatically.
Set `TEST_MYSQL_DUMP_PATH` to a MariaDB/MySQL dump client to include the native
backup/restore round trip (CI installs `mariadb-dump`). Unit tests also
exercise mounted cache refresh, forms, and dialog keyboard behavior in jsdom.

The acceptance script above writes to the configured app database, so use it
only against a disposable environment.

### Updating an existing installation

Close the App Server window. `update-app.bat` takes a backup, pulls with
`--ff-only`, installs locked dependencies, applies migrations, then builds the
app. A failed backup, migration, or build stops the update.

For a manual update, configure `.env.local`, stop app writes, then run:

```powershell
npm run db:backup
npm run db:migrate
npm run db:check
```

The migration guide in `database/README.md` explains the explicit
timezone choice for an old database without a UTC migration marker. `npm start`
checks schema compatibility before serving requests.

### Render (optional — online deployment)

The app deploys as a **single Render Web Service** (`rgarage-web`) from the
repository root. Both the UI and `/api/*` routes run in the same Node.js
process, so there are no cross-service HTTP hops, no `BACKEND_URL` /
`FRONTEND_ORIGIN` sync issues, and a single cron job pinging `/health` keeps
the entire application warm. Render does not provide managed MySQL, so the
database lives at an external managed MySQL host (such as Aiven).

**Recommended database: Aiven (always-free plan)** — 1 GB storage/RAM, daily
backups, TLS, no credit card. It powers off after long inactivity (you get
an email; there is a power-on button in their console), and daily app use
keeps it awake. Prefer to not think about it? DigitalOcean Managed MySQL
(~$15/mo) is the no-fuss paid option; any MySQL 8 endpoint works.

**Fast path — apply the `render.yaml` blueprint** (recommended):

1. Get the database values first (Aiven setup below, or any managed MySQL):
   host, port, password, and the provider's `ca.pem`.
2. Render Dashboard → *New +* → **Blueprint** → select this repo. Render
   reads `render.yaml` and prompts for the database secrets (`DB_HOST`,
   `DB_PORT`, `DB_PASSWORD`, `DB_SSL_CA` — paste `ca.pem`; one line with
   `\n` escapes works). `DB_USER` (`avnadmin`) and `DB_NAME` (`defaultdb`)
   are pre-filled for Aiven's free plan — change them if yours differ.
3. Click **Apply**. Render creates `rgarage-web` on the free plan in Singapore,
   generates `AUTH_SECRET`, sets `NODE_ENV=production` and `DB_SSL=true`, and
   uses `/health` as the liveness check. Pushes to `main` auto-deploy from then on.

The manual walkthrough below produces the same result step by step — use it
to understand the pieces, or if you don't apply the blueprint:

1. **Create the database (Aiven).** aiven.io → new **MySQL** service (pick
   Singapore, the closest region). Aiven pre-creates a database called
   `defaultdb`; free plans may not allow adding another — that is fine, use
   `defaultdb` (the import command and `DB_NAME` below assume it). From
   **Overview** note the host, port, user (`avnadmin`) and password, and
   download the **CA certificate** (`ca.pem`).
2. **Web service.** Render → *New → Web Service* → connect this repo.
   Build `npm ci && npm run build`, Start `npm start`, Health Check Path `/health`.
   Environment:
   - `DB_HOST`, `DB_PORT`, `DB_NAME=defaultdb`, `DB_USER`, `DB_PASSWORD` —
     the values from step 1
   - `DB_SSL=true` (managed MySQL requires TLS); optionally `DB_SSL_CA` =
     contents of `ca.pem` to also verify the server certificate (if the
     dashboard strips line breaks, write each break as `\n` — both forms
     work)
   - `AUTH_SECRET` — a long random value (`.env.example` has a one-liner
     that generates one)
   - `APP_TIME_ZONE=Asia/Manila`
   - `NODE_ENV=production` — marks the login cookie `Secure` over HTTPS
3. **Move the shop's data up.** With local MySQL running, take a fresh dump:
   `scripts\backup-db.bat`. Then, from the repo root, aim a one-off import at
   Aiven (process environment beats `.env.local`, so nothing local changes
   permanently) and load it:

   ```powershell
   $env:DB_HOST="<host>"; $env:DB_PORT="<port>"; $env:DB_USER="avnadmin"; $env:DB_PASSWORD="<password>"
   $env:DB_SSL="true"
   $env:DB_SSL_CA = Get-Content "$HOME\Downloads\ca.pem" -Raw
   npm run db:import -- "backups\hardware_inventory_<stamp>.sql" --database defaultdb
   ```

   The dump carries users, products, sales and migration history. Run
   `npm run db:migrate` followed by `npm run db:check` before starting the app.
   Nothing needs seeding. (While those `$env:` values are set, any `db:*` command in
   that same window also points at Aiven; close the window when done.)
4. **Verify + install.** Open `https://<your-ui>.onrender.com`, sign in with
   the same account, compare the Dashboard with the shop PC, and record and
   void one test sale. On Android, Chrome now offers the *full* install
   (`https://` unlocks it), and the app works away from the shop Wi-Fi.

Notes: Render's **free** services sleep after ~15 minutes idle — the first
visit of the day takes ~30–60 s to wake (Starter, $7/mo, stays always on),
or a single cron job pinging `https://<your-ui>.onrender.com/health` keeps
the unified service awake.

---

## Backups

The database is your ledger — treat it like one.

- **Automatic:** `run-app.bat` takes a backup the first time the app starts
  each day (skip-worthy: it only runs when no backup exists for today).
- **Manual:** `scripts\backup-db.bat` — dated dumps go to
  `backups\<DB_NAME>_<UTC timestamp>.sql`. Both backup and restore use the
  database configured in `.env.local`, including TLS settings.
  `MYSQL_DUMP_PATH` selects the native dump client when it is not on PATH or
  in the default XAMPP location. A dump is finalized only after success; only
  this command's finalized backups older than 14 days are removed. Pass
  `silent` to skip the pause (used by `run-app.bat`).
- **Restore:** stop the app server window first, then
  `scripts\restore-db.bat backups\hardware_inventory_....sql` and confirm at
  the prompt. Start the app server again afterwards.
- **Restore / upload to a remote database** (e.g. the Render deployment):
  point `DB_*` at that server — plus `DB_SSL=true` when it requires TLS —
  and run `npm run db:import -- backups\hardware_inventory_....sql`.
  Add `--database <name>` when the target's database name differs from the
  dump's (Aiven's free plan: `defaultdb`).
- **Off-machine copies:** now and then copy a dump to a USB stick or cloud
  drive — a backup that only lives on the same PC is not a disaster plan.
- **Optional schedule:** Windows **Task Scheduler** → daily 20:00 →
  run `C:\dev\Inventory-sys\scripts\backup-db.bat silent`.

Never expose phpMyAdmin or port 3306 to the public internet. MySQL on this
machine is bound to `127.0.0.1` only (`bind-address` in `my.ini`).

---

## If something looks wrong

| Symptom | What to do |
|---|---|
| "Cannot connect to the local database…" | Start **MySQL** in the XAMPP Control Panel, then Retry. |
| Login rejects the password | Re-run `npm run db:seed-owner` with `SEED_OWNER_PASSWORD` set in `.env.local`. |
| "Sales have already been recorded for this date" warning | Expected when adding a second entry for the same business date — confirm and continue, or pick the right date. |
| "Not enough stock — nothing was saved" | The batch needs more than the shelf has. Fix the highlighted quantities; no partial entry is ever saved. |
| Want to undo a saved entry | Void it (reason required), then re-enter. Nothing is deleted. |

---

## How correctness is enforced (for maintainers)

- Stock only changes inside `src/services/*` functions that update
  `products.stock_on_hand` **and** write a `stock_movements` row in the same
  SQL transaction. `stock_on_hand` always equals the sum of the ledger.
- `postSalesBatch()` locks every affected product row, re-checks stock, and
  rejects the **whole** batch on any shortage; a stored `request_id` makes
  retries idempotent.
- Sale lines store name/SKU/unit plus base/final price snapshots, so catalog
  edits never rewrite history. Voiding restores stock exactly once and keeps
  the record.
- Money and quantities are handled as decimal strings with BigInt-based
  scaling — no floating-point drift. The server always recomputes totals.
- Successful writes invalidate all cached reads, mounted views refetch, and
  responses started before invalidation cannot restore stale data. Login and
  local sign-out clear session data from the cache.
- `/api/wake` probes the API's database-aware `/ready` endpoint; `/health`
  remains a process-only liveness check. Sign-out clears the frontend cookie
  even when the API is unavailable.
- Both API entry points cap request bodies at 1 MiB. List filters, pagination,
  and dates are validated; signed sessions re-check account activity.

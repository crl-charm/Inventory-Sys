# Hardware Store Inventory & Daily Sales

Replace the notebook: record what was sold at the end of the day, and the app
deducts stock, totals the day's revenue, and keeps a full audit trail.

Built to `hardware_store_inventory_agent_spec.md` (Next.js frontend + Node
API + TypeScript + Tailwind + MySQL/MariaDB via XAMPP, `mysql2`).

The repo is split for two Render Web Services: `frontend/` (UI) and
`backend/` (API + DB scripts).

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
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. **Create environment files** — copy `backend/.env.example` to
   `backend/.env.local` and `frontend/.env.example` to `frontend/.env.local`.
   Defaults match a stock XAMPP install (`root`, empty password). Generate a
   secret for `AUTH_SECRET`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Create the database and tables**

   ```powershell
   npm run db:init      # creates hardware_inventory + applies backend/database/schema.sql
   npm run db:migrate   # applies versioned migrations (no-op on a fresh install)
   ```

   `db:init` creates `hardware_inventory`, applies `backend/database/schema.sql`,
   and seeds the starting categories. `db:migrate` upgrades an existing database
   in place and is safe to re-run. (Alternatively import the schema via
   phpMyAdmin — see `backend/database/README.md`.)

5. **Create the owner account** (no public sign-up exists)

   ```powershell
   npm run db:seed-owner
   ```

   Uses `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` from `backend/.env.local`
   when set; otherwise creates `owner` and prints a generated password **once**.
   Re-run any time to change the password. To add an **additional account**
   (staff), set `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` /
   `SEED_OWNER_NAME` to that person's details and run it again — each
   username is its own row. (Against the cloud database, also set the
   `DB_*` variables from the Render section, including `DB_SSL`.)

6. **Run the app** — easiest is to double-click **`run-app.bat`** in the repo
   root. It checks MySQL, takes the day's backup, starts both windows, waits
   until they answer, and opens the browser (it builds the website first if
   `.next` is missing).

   Manual alternative — two terminals:

   ```powershell
   npm run dev:backend    # API at http://localhost:4000
   npm run dev:frontend   # UI at http://localhost:3000
   ```

   Open <http://localhost:3000> and sign in. The UI proxies `/api/*` to the
   backend so the session cookie stays on the frontend origin.

   After new code arrives (`git pull`), double-click **`update-app.bat`** to
   pull, install and rebuild — then start the app again.

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
| `npm run dev:backend` | Start the API on port 4000 |
| `npm run dev:frontend` | Start the UI on port 3000 |
| `npm run db:init` | Create DB + apply `backend/database/schema.sql` (safe to re-run) |
| `npm run db:migrate` | Apply versioned migrations to an existing database (safe to re-run) |
| `npm run db:import -- <dump.sql> [--database <name>]` | Load a dump into the configured database (local or cloud; obeys `DB_SSL`) |
| `npm run db:ping` | Check the configured database connection (server, TLS, database exists) |
| `npm run db:seed-owner` | Create/update an account (owner or staff) |
| `npm run icons` | Regenerate favicon + PWA icons from `frontend/public/logo.svg` |
| `powershell -ExecutionPolicy Bypass -File backend\scripts\acceptance.ps1` | End-to-end checks (mutates data; needs both servers) |
| `run-app.bat` (double-click) | MySQL check → daily backup → backend + frontend → browser |
| `update-app.bat` (double-click) | `git pull` + install + rebuild the website |
| `scripts\backup-db.bat` | Take a database dump now (kept 14 days) |
| `scripts\restore-db.bat <dump.sql>` | Restore a dump (asks to confirm) |

### Render (optional — online deployment)

The app was built to deploy as **two Render Web Services** (API + UI) from
this repo. Both on Render is the intended layout: the browser only ever
talks to the UI service, which proxies `/api/*` to the API server-side, so
cookies stay first-party and there is no CORS to configure. The one piece
Render does not provide is **MySQL** (its managed databases are Postgres),
so the database lives at an external managed MySQL host.

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
3. Click **Apply**. Render creates `rgarage-api` and `rgarage-web` on the
   free plan in Singapore, generates `AUTH_SECRET`, sets `HOST`,
   `NODE_ENV` and `DB_SSL`, and points `FRONTEND_ORIGIN` and `BACKEND_URL`
   at each other automatically. Pushes to `main` auto-deploy from then on.

The manual walkthrough below produces the same result step by step — use it
to understand the pieces, or if you don't apply the blueprint:

1. **Create the database (Aiven).** aiven.io → new **MySQL** service (pick
   Singapore, the closest region). Aiven pre-creates a database called
   `defaultdb`; free plans may not allow adding another — that is fine, use
   `defaultdb` (the import command and `DB_NAME` below assume it). From
   **Overview** note the host, port, user (`avnadmin`) and password, and
   download the **CA certificate** (`ca.pem`).
2. **API service.** Render → *New → Web Service* → connect this repo.
   Root Directory `backend`, Build `npm install`, Start `npm start`, Health
   Check Path `/health`. Environment:
   - `DB_HOST`, `DB_PORT`, `DB_NAME=defaultdb`, `DB_USER`, `DB_PASSWORD` —
     the values from step 1
   - `DB_SSL=true` (managed MySQL requires TLS); optionally `DB_SSL_CA` =
     contents of `ca.pem` to also verify the server certificate (if the
     dashboard strips line breaks, write each break as `\n` — both forms
     work)
   - `AUTH_SECRET` — a long random value (`backend/.env.example` has a
     one-liner that generates one)
   - `APP_TIME_ZONE=Asia/Manila`
   - `NODE_ENV=production` — this is what marks the login cookie `Secure`
     over HTTPS
   - `HOST=0.0.0.0` — the API binds to `127.0.0.1` (LAN-only) by default,
     so a public host must opt in
   - `FRONTEND_ORIGIN=https://<your-ui>.onrender.com` — fill this in after
     step 3, then redeploy (manual deploy) once so the setting is picked up
3. **UI service.** *New → Web Service*, same repo. Root Directory `frontend`,
   Build `npm install && npm run build`, Start `npm start`. Environment:
   `BACKEND_URL=https://<your-api>.onrender.com` (from step 2) and
   `APP_TIME_ZONE=Asia/Manila`.
4. **Move the shop's data up.** With local MySQL running, take a fresh dump:
   `scripts\backup-db.bat`. Then, from `backend\`, aim a one-off import at
   Aiven (process environment beats `.env.local`, so nothing local changes
   permanently) and load it:

   ```powershell
   $env:DB_HOST="<host>"; $env:DB_PORT="<port>"; $env:DB_USER="avnadmin"; $env:DB_PASSWORD="<password>"
   $env:DB_SSL="true"
   $env:DB_SSL_CA = Get-Content "$HOME\Downloads\ca.pem" -Raw
   npm run db:import -- "..\backups\hardware_inventory_<stamp>.sql" --database defaultdb
   ```

   The dump carries users, products, sales and migration history — nothing
   needs seeding. (While those `$env:` values are set, any `db:*` command in
   that same window also points at Aiven; close the window when done.)
5. **Verify + install.** Open `https://<your-ui>.onrender.com`, sign in with
   the same account, compare the Dashboard with the shop PC, and record and
   void one test sale. On Android, Chrome now offers the *full* install
   (`https://` unlocks it), and the app works away from the shop Wi-Fi.

Notes: Render's **free** services sleep after ~15 minutes idle — the first
visit of the day takes ~30–60 s to wake (Starter, $7/mo per service, stays
always on). `FRONTEND_ORIGIN` still accepts a comma-separated list, so this
one API can serve both the cloud UI and your localhost/LAN copy if you keep
using the shop PC as well.

---

## Backups

The database is your ledger — treat it like one.

- **Automatic:** `run-app.bat` takes a backup the first time the app starts
  each day (skip-worthy: it only runs when no backup exists for today).
- **Manual:** `scripts\backup-db.bat`  — dated dumps go to
  `backups\hardware_inventory_YYYY-MM-DD_HH-mm-ss.sql`, and files older than
  14 days are deleted automatically. Pass `silent` to skip the pause (used by
  `run-app.bat`).
- **Restore:** stop the backend window first, then
  `scripts\restore-db.bat backups\hardware_inventory_....sql` and confirm at
  the prompt. Start the backend again afterwards.
- **Restore / upload to a remote database** (e.g. the Render deployment):
  point `DB_*` at that server — plus `DB_SSL=true` when it requires TLS —
  and run `npm run db:import -- ..\backups\hardware_inventory_....sql`.
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

- Stock only changes inside `backend/src/services/*` functions that update
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
<!-- telemetry: 2026-10-23T06:04:18Z id: 28cc22f0-91b9-4008-b2f5-ca8471bed212 -->

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
   Re-run any time to change the password.

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
| `npm run db:seed-owner` | Create/update the owner account |
| `npm run icons` | Regenerate favicon + PWA icons from `frontend/public/logo.svg` |
| `powershell -ExecutionPolicy Bypass -File backend\scripts\acceptance.ps1` | End-to-end checks (mutates data; needs both servers) |
| `run-app.bat` (double-click) | MySQL check → daily backup → backend + frontend → browser |
| `update-app.bat` (double-click) | `git pull` + install + rebuild the website |
| `scripts\backup-db.bat` | Take a database dump now (kept 14 days) |
| `scripts\restore-db.bat <dump.sql>` | Restore a dump (asks to confirm) |

### Render

Create **two Web Services** from this repo:

1. **API** — Root Directory `backend`, build `npm install`, start `npm start`.
   Set `DB_*`, `AUTH_SECRET`, `APP_TIME_ZONE`, `HOST=0.0.0.0` (the API binds
   to `127.0.0.1` by default — LAN-only — and a public host must opt in), and
   `FRONTEND_ORIGIN` to the frontend URL (e.g.
   `https://your-ui.onrender.com`). `FRONTEND_ORIGIN`
   accepts a comma-separated list, so one API can serve both localhost and a
   LAN address (e.g. `http://localhost:3000,http://192.168.68.102:3000`),
   which is what lets the store phone sign in over Wi-Fi.
2. **UI** — Root Directory `frontend`, build `npm install && npm run build`,
   start `npm start`. Set `BACKEND_URL` to the API URL
   (e.g. `https://your-api.onrender.com`).

Render sets `PORT` for you. Point `DB_HOST` at a MySQL instance Render can
reach (Render Postgres is not a drop-in; this app is MySQL/MariaDB).

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

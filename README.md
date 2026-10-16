# Hardware Store Inventory & Daily Sales

Replace the notebook: record what was sold at the end of the day, and the app
deducts stock, totals the day's revenue, and keeps a full audit trail.

Built to `hardware_store_inventory_agent_spec.md` (Next.js App Router +
TypeScript + Tailwind + MySQL/MariaDB via XAMPP, `mysql2`).

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

3. **Create your environment file** — copy `.env.example` to `.env.local` and
   adjust if needed (defaults match a stock XAMPP install: `root`, empty
   password). Generate a secret for `AUTH_SECRET`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Create the database and tables**

   ```powershell
   npm run db:init      # creates hardware_inventory + applies database/schema.sql
   npm run db:migrate   # applies versioned migrations (no-op on a fresh install)
   ```

   `db:init` creates `hardware_inventory`, applies `database/schema.sql`, and
   seeds the starting categories. `db:migrate` upgrades an existing database in
   place and is safe to re-run. (Alternatively import `database/schema.sql`
   via phpMyAdmin — see `database/README.md`.)

5. **Create the owner account** (no public sign-up exists)

   ```powershell
   npm run db:seed-owner
   ```

   Uses `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` from `.env.local` when
   set; otherwise creates `owner` and prints a generated password **once**.
   Re-run any time to change the password.

6. **Run the app**

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000> and sign in.

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
| `npm run dev` | Start the app (development) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run db:init` | Create DB + apply `database/schema.sql` (safe to re-run) |
| `npm run db:migrate` | Apply versioned migrations to an existing database (safe to re-run) |
| `npm run db:seed-owner` | Create/update the owner account |
| `powershell -ExecutionPolicy Bypass -File scripts\acceptance.ps1` | Run the end-to-end acceptance checks (mutates data; needs the dev server running) |

---

## Backups

Export regularly through phpMyAdmin (**Export**) or `mysqldump`; keep the dump
outside the XAMPP folder. Details in `database/README.md`.

Never expose phpMyAdmin or port 3306 to the public internet.

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

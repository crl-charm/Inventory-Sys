# Hardware Store Inventory & Daily Sales System — Build Specification

> **Audience:** AI coding agents (and humans) building this project.
> **Status:** Single source of truth. Follow it literally. Where it is silent, choose the simplest option consistent with Sections 1–3 and log the decision in `docs/DECISIONS.md`.
> **Stack:** Next.js (App Router) · TypeScript (strict) · MySQL via XAMPP (MariaDB) · Prisma · Tailwind + shadcn/ui

---

## 0. How to use this document

1. Read the whole document before writing code.
2. Build in the order of **Section 17 (Build Phases)**. Finish and verify each phase before starting the next.
3. Do **not** add features outside scope (Section 1.3). If something seems missing, check Section 3 (Assumptions) first.
4. Business rules carry IDs (`BR-01`…). Reference them in code comments and tests.
5. Keywords: **MUST** = required, **SHOULD** = strongly recommended, **MAY** = optional.
6. Copy this file to `docs/SPEC.md` in the repo so it stays with the code.
7. If you hit a genuine ambiguity that Section 3 does not resolve, pick the simplest option, write it to `docs/DECISIONS.md` (date, question, choice, reason), and continue. Do not stop and wait.

---

## 1. Product overview

### 1.1 Problem
The owner of a hardware store selling car-related goods (engine oils, mags/wheels, tires, and similar) tracks inventory with a notebook and pen. Stock counts drift, daily sales are hard to review, and nobody can see at a glance what is running low.

### 1.2 Goal
Replace the notebook with a simple web system where:

1. The owner maintains a **product catalog** with a stock count per product.
2. At the **end of the day** the owner enters what was sold: *product + quantity* (example: "Engine Oil 1L — 3"). The system **automatically deducts inventory**. No manual stock math.
3. A **dashboard** showcases the day's sales (total, items sold, by category, top products) and **current inventory** (including low/out-of-stock alerts), always up to date.

**Success criteria**
- The owner can enter a typical day's sales in under 2 minutes.
- Stock numbers always equal (starting stock + restocks − sales ± adjustments). Always. No exceptions.
- Every stock change is traceable to a reason (sale, restock, adjustment, void).
- The owner can open the dashboard and understand the day without training.

### 1.3 Non-goals (MVP — do NOT build)
POS / barcode scanning · receipt printing · customer accounts · credit ("utang") tracking · supplier / purchase-order management · multi-branch / multi-store · payment-method breakdown · tax/VAT · discounts as percentages · e-commerce / public storefront · offline mode / PWA sync · multi-currency · multi-language · email/SMS notifications.

### 1.4 Guiding principles
1. **Simplicity first** — fewest clicks to record a day's sales.
2. **Correctness of stock** — never show wrong numbers; all stock changes are transactional and logged.
3. **Forgiving** — mistakes are fixed by *voiding* and re-entering, never by silently editing history.
4. **Mobile-friendly** — the owner may use a phone or a small PC screen.
5. **Auditable** — history is immutable; snapshots preserve what was true at the time.

---

## 2. Users & roles

| Role | Description | MVP status |
|---|---|---|
| `OWNER` | Full access to everything | **Implemented.** One seeded account. |
| `STAFF` | Can enter sales and view products/dashboard; cannot edit prices, void sales, adjust stock, or change settings | Schema + `requireRole()` guard implemented; **no UI to create staff** (use `npm run user:create`). |

### Permission matrix

| Action | OWNER | STAFF |
|---|:-:|:-:|
| View dashboard, products, inventory, sales history | ✅ | ✅ |
| Create sales entry | ✅ | ✅ |
| Void a sale | ✅ | ❌ |
| Create / edit products, categories | ✅ | ❌ |
| Restock, adjust stock | ✅ | ❌ |
| View cost prices & profit | ✅ | ❌ (hide `costPrice`, `unitCost`, `grossProfit` from API responses) |
| Settings, change own password | ✅ | change own password only |
| Export CSV | ✅ | ❌ |

---

## 3. Assumptions & open questions

The agent MUST build to these defaults. They are the product owner's *current best answers*; do not block on them.

### 3.1 Assumptions

| ID | Assumption | Notes |
|---|---|---|
| A1 | One store, one primary user (the owner). | Multi-branch is a non-goal. |
| A2 | Currency is **PHP (₱)**; timezone is **Asia/Manila (UTC+8)**. | Both configurable via env (`APP_CURRENCY`, `APP_TIMEZONE`). "Today" and business-day boundaries use the store timezone, never the server's. |
| A3 | Quantities are **whole units** (bottle, can, piece, set). | Loose/by-the-liter selling is not supported. `stock_qty` is `INT`. |
| A4 | **Every variant is its own product.** Example: "Mags 15in 4x100 Black", "Tire 185/65R15 BrandX", "Engine Oil 10W-40 1L". | No variant matrix. Use `brand` and descriptive `name`. |
| A5 | Sales are entered in bulk at end of day as *product + quantity* lines; no per-customer receipt. | Unit price defaults to the product's selling price; override per line is allowed. |
| A6 | Payment method, tax, customer, and discount % are **not** tracked. | A price override covers discounts. |
| A7 | Cost price is **optional**; profit figures are labeled "estimated". | Products without cost price count as cost 0 and trigger a warning label. |
| A8 | UI language is English. | |
| A9 | Runs on the store's own PC with XAMPP's MySQL (actually MariaDB), opened in a browser on that PC or on a phone over the local network. | Code MUST stay hosting-ready (only `DATABASE_URL` and cookie settings change). See Section 16. |
| A10 | Low-stock threshold is per product (`reorderLevel`, default 5). | |
| A11 | Concurrency is low (1–3 users) but correctness under concurrent writes is still required. | See Section 9.1. |

### 3.2 Open questions for the product owner (defaults apply until answered)

| ID | Question | Default used |
|---|---|---|
| Q1 | Will the system run on the shop PC only, or be hosted online so it opens from anywhere? | Local-first, hosting-ready. |
| Q2 | Will staff besides the owner need their own logins? | Owner only for now. |
| Q3 | How will starting stock be loaded: typed per product, or imported from a spreadsheet? | Product form (MVP) + CSV import (Phase 8). |
| Q4 | Does the owner want to sell some items at different prices on different days? | Yes — per-line price override at sale entry. |

---

## 4. Technology stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (latest stable), App Router** | Server Components for page shells; Route Handlers for the JSON API. |
| Language | **TypeScript, `strict: true`** | `noUncheckedIndexedAccess: true`. No `any` (use `unknown` + narrowing). |
| Runtime | Node.js 20 LTS or 22 LTS | |
| Database | **MySQL via XAMPP** (ships MariaDB 10.4+; fully compatible with the `mysql` Prisma provider) | InnoDB, `utf8mb4`, collation `utf8mb4_unicode_ci`. Avoid MySQL-8-only features. |
| ORM / migrations | **Prisma** (latest stable) | Newer Prisma majors use driver adapters (e.g. the MariaDB adapter) and `prisma.config.ts` — follow the official setup docs for the installed version, but keep the **models exactly as in Section 7**. |
| Validation | **Zod** | One schema file shared by client forms and API handlers (`src/schemas/`). |
| Styling / UI | **Tailwind CSS + shadcn/ui** (Radix primitives) | Mobile-first. Dark mode optional. |
| Forms | **React Hook Form** + `@hookform/resolvers/zod` | `useFieldArray` for sales lines. |
| Data fetching (client) | **TanStack Query v5** | Polling + invalidation = "live" feel. |
| Charts | **Recharts** | Line (trend), bar/donut (category share). |
| Auth | Custom: `bcryptjs` (cost 12) + signed JWT in an httpOnly cookie via `jose` | No third-party auth service needed. |
| Testing | **Vitest** (unit/integration), **Playwright** (one E2E happy path) | Tests run against a separate DB `hardware_inventory_test`. |
| Lint/format | ESLint (Next config) + Prettier | |

---

## 5. Environment setup (XAMPP)

### 5.1 One-time setup
1. Install XAMPP. Open the **XAMPP Control Panel** and start **MySQL** (Apache is NOT required).
2. Open `http://localhost/phpmyadmin` (needs Apache) **or** use the MySQL shell. Create:
   - Database `hardware_inventory` — collation `utf8mb4_unicode_ci`
   - Database `hardware_inventory_test` — same collation
3. (Recommended) Create a dedicated DB user instead of `root`:
   ```sql
   CREATE USER 'hw_app'@'localhost' IDENTIFIED BY 'change-me';
   GRANT ALL PRIVILEGES ON hardware_inventory.* TO 'hw_app'@'localhost';
   GRANT ALL PRIVILEGES ON hardware_inventory_test.* TO 'hw_app'@'localhost';
   -- Prisma `migrate dev` needs a shadow database; for local dev either grant CREATE
   -- globally or just use root locally.
   FLUSH PRIVILEGES;
   ```
4. Default XAMPP MySQL: host `127.0.0.1`, port `3306`, user `root`, **empty password**. If port 3306 is taken, change it in `my.ini` and update `DATABASE_URL`.

### 5.2 `.env.example`
```env
# Database (XAMPP default: root with empty password)
DATABASE_URL="mysql://root:@127.0.0.1:3306/hardware_inventory"
TEST_DATABASE_URL="mysql://root:@127.0.0.1:3306/hardware_inventory_test"

# Auth
AUTH_SECRET="generate-with: openssl rand -base64 48"
SESSION_DAYS="14"
COOKIE_SECURE="false"          # "true" only when served over HTTPS

# Store settings
STORE_NAME="My Hardware Store"
APP_TIMEZONE="Asia/Manila"
APP_CURRENCY="PHP"
APP_LOCALE="en-PH"

# Seed
SEED_ADMIN_USERNAME="owner"
SEED_ADMIN_PASSWORD="change-this-on-first-login"
SEED_SAMPLE_DATA="true"         # loads sample categories/products for demos
```

### 5.3 NPM scripts (MUST exist)
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start -p 3000",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "tsx prisma/seed.ts",
  "db:reset": "prisma migrate reset --force",
  "db:reconcile": "tsx scripts/reconcile.ts",
  "user:create": "tsx scripts/create-user.ts"
}
```

---

## 6. Architecture

### 6.1 High-level diagram
```
┌────────────────────────────┐
│ Browser (owner PC / phone) │
│  React UI (Next.js client) │
│  TanStack Query cache      │
└─────────────┬──────────────┘
              │ HTTPS/HTTP · JSON · httpOnly session cookie
┌─────────────▼──────────────────────────────────────────┐
│ Next.js server                                         │
│  middleware/proxy → auth redirect for pages            │
│  Route Handlers  /api/*   (thin: auth, parse, respond) │
│        │ calls                                         │
│  Services (src/server/services)  ← ALL business logic  │
│        │ uses                                          │
│  Prisma Client (src/server/db.ts)                      │
└─────────────┬──────────────────────────────────────────┘
              │ SQL (InnoDB transactions)
┌─────────────▼──────────────┐
│ MySQL / MariaDB (XAMPP)    │
└────────────────────────────┘
```

### 6.2 Layer rules (MUST)
| Layer | Responsibility | MUST NOT |
|---|---|---|
| **Route Handler** (`app/api/**/route.ts`) | Authenticate, parse/validate input (Zod), call one service function, map result/errors to HTTP | Contain business rules or call Prisma directly |
| **Service** (`server/services/*.ts`) | Business rules, transactions, stock math, aggregation | Know about HTTP, cookies, or `Request`/`Response` |
| **Prisma / DB** | Persistence | Be called from components or route handlers |
| **Server Components** | May call services directly to render initial data | Mutate data (mutations go through API) |
| **Client Components** | Forms, interactivity, charts, polling | Compute authoritative totals (display-only) |

Services throw typed errors (`AppError` subclasses, Section 14). A single `withApi()` wrapper in `server/http.ts` converts them to the standard error envelope.

### 6.3 Folder structure
```
hardware-inventory/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                 # includes a hand-edited migration adding CHECK constraints (Section 7.3)
│  └─ seed.ts
├─ scripts/
│  ├─ backup.bat                  # mysqldump backup (Section 16)
│  ├─ reconcile.ts                # verifies products.stock_qty == SUM(stock_movements)
│  └─ create-user.ts
├─ docs/
│  ├─ SPEC.md                     # copy of this file
│  └─ DECISIONS.md
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/layout.tsx         # app shell: sidebar (desktop) / bottom nav (mobile), auth guard
│  │  ├─ (app)/dashboard/page.tsx
│  │  ├─ (app)/sales/page.tsx             # history
│  │  ├─ (app)/sales/new/page.tsx         # END-OF-DAY ENTRY (primary screen)
│  │  ├─ (app)/sales/[id]/page.tsx        # detail + void
│  │  ├─ (app)/products/page.tsx
│  │  ├─ (app)/products/new/page.tsx
│  │  ├─ (app)/products/[id]/page.tsx     # edit
│  │  ├─ (app)/inventory/page.tsx         # live stock overview
│  │  ├─ (app)/inventory/restock/page.tsx
│  │  ├─ (app)/inventory/movements/page.tsx
│  │  ├─ (app)/reports/page.tsx
│  │  ├─ (app)/settings/page.tsx
│  │  └─ api/**/route.ts
│  ├─ server/
│  │  ├─ db.ts                    # Prisma singleton (global cache in dev)
│  │  ├─ errors.ts                # AppError + subclasses
│  │  ├─ http.ts                  # withApi(), ok(), fail(), pagination helpers
│  │  ├─ auth/ (session.ts, password.ts, guards.ts, rate-limit.ts)
│  │  └─ services/
│  │     ├─ sales.service.ts
│  │     ├─ inventory.service.ts
│  │     ├─ products.service.ts
│  │     ├─ categories.service.ts
│  │     ├─ dashboard.service.ts
│  │     ├─ reports.service.ts
│  │     └─ settings.service.ts
│  ├─ schemas/                    # Zod schemas shared by client + server
│  ├─ lib/ (money.ts, dates.ts, constants.ts, csv.ts, utils.ts)
│  ├─ components/ (ui/, layout/, sales/, products/, inventory/, dashboard/)
│  ├─ hooks/                      # TanStack Query hooks: useProducts, useDashboard, ...
│  └─ types/
├─ tests/ (unit/, integration/, e2e/)
└─ .env.example
```

### 6.4 "Live" inventory strategy
The owner is effectively the only writer, so **polling + invalidation** is sufficient (no WebSockets in MVP).
- All stock and dashboard queries use TanStack Query with `refetchOnWindowFocus: true` and `refetchInterval: 15_000` (pause when tab hidden: `refetchIntervalInBackground: false`).
- After any successful mutation (sale, void, restock, adjustment, product edit) invalidate: `['dashboard']`, `['products']`, `['inventory']`, `['sales']`.
- Stock shown anywhere is always read from `products.stock_qty` (the cached, always-consistent running balance).
- *Future option (not MVP):* Server-Sent Events from `/api/stream`.

### 6.5 Date & time handling (MUST)
- DB stores timestamps (`created_at`, etc.) in **UTC** (`DATETIME(3)`).
- `sale_date` is a **calendar date** (`DATE`) in the **store timezone** — the business day the owner is reporting.
- API sends/accepts dates as `YYYY-MM-DD` strings. Convert to Prisma with `new Date(`${s}T00:00:00.000Z`)` and back with `d.toISOString().slice(0, 10)` — never use local-time `Date` methods on `@db.Date` values (avoids off-by-one-day bugs).
- `todayInStoreTz()` in `lib/dates.ts`:
  ```ts
  export const todayInStoreTz = (tz = process.env.APP_TIMEZONE ?? "Asia/Manila") =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // "YYYY-MM-DD"
  ```
- Display timestamps in the store timezone with `Intl.DateTimeFormat`.

### 6.6 Money handling (MUST)
- DB: `DECIMAL(12,2)`.
- Server: use `Prisma.Decimal` (decimal.js) for all arithmetic. **Never** use JS `number` for money math.
- API output: money as **strings with 2 decimals** (`"1250.00"`). API input: strings matching `^\d{1,10}(\.\d{1,2})?$`.
- Client: `lib/money.ts` formats with `Intl.NumberFormat(APP_LOCALE, { style: "currency", currency: APP_CURRENCY })`. Client-side totals use integer centavos (`Math.round(parseFloat(x) * 100)`) for display only.
- Quantities are plain integers.

---

## 7. Domain model & database

### 7.1 Entity overview
```
users ─────────────┐
                   │ created_by / voided_by
categories 1───* products 1───* stock_movements *───1 users
     │                │                 │
     │                │                 │ sale_id (nullable)
     │                └───* sale_items *───1 sales 1───* stock_movements
     └──────────────────────┘ (category snapshot)
settings (key/value)
```

| Table | Purpose |
|---|---|
| `users` | Login accounts. |
| `categories` | Product groups (Oils, Mags, Tires, …). Owner-editable. |
| `products` | Sellable items + **current running stock** (`stock_qty`). |
| `sales` | One end-of-day entry batch (header). Immutable except void fields. |
| `sale_items` | Lines of a sale, with **snapshots** of name/sku/price/cost/category. |
| `stock_movements` | **Immutable ledger** of every stock change. Source of truth for audits. |
| `settings` | Key/value store settings. |

**Invariant (MUST always hold):** for every product, `products.stock_qty = SUM(stock_movements.quantity_change)`. `scripts/reconcile.ts` verifies this and exits non-zero on mismatch.

### 7.2 Prisma schema (use exactly)
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  OWNER
  STAFF
}

enum SaleStatus {
  ACTIVE
  VOIDED
}

enum MovementType {
  INITIAL     // opening stock when a product is created
  RESTOCK     // stock received
  SALE        // deducted by a sale
  SALE_VOID   // restored by voiding a sale
  ADJUSTMENT  // manual correction / physical count
}

model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique @db.VarChar(50)
  displayName  String   @map("display_name") @db.VarChar(100)
  passwordHash String   @map("password_hash") @db.VarChar(255)
  role         UserRole @default(OWNER)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.DateTime(3)

  salesCreated Sale[]          @relation("SaleCreatedBy")
  salesVoided  Sale[]          @relation("SaleVoidedBy")
  movements    StockMovement[]

  @@map("users")
}

model Category {
  id        Int      @id @default(autoincrement())
  name      String   @unique @db.VarChar(80)
  code      String   @unique @db.VarChar(5)   // SKU prefix, e.g. OIL, MAG, TIR
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.DateTime(3)

  products  Product[]
  saleItems SaleItem[]

  @@map("categories")
}

model Product {
  id           Int      @id @default(autoincrement())
  sku          String   @unique @db.VarChar(40)
  name         String   @db.VarChar(150)
  brand        String?  @db.VarChar(80)
  categoryId   Int      @map("category_id")
  unit         String   @default("pc") @db.VarChar(20)      // pc, bottle, can, set, ...
  sellingPrice Decimal  @map("selling_price") @db.Decimal(12, 2)
  costPrice    Decimal  @default(0) @map("cost_price") @db.Decimal(12, 2)
  stockQty     Int      @default(0) @map("stock_qty")        // running balance; mutate ONLY via inventory.service
  reorderLevel Int      @default(5) @map("reorder_level")
  isActive     Boolean  @default(true) @map("is_active")
  notes        String?  @db.VarChar(500)
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.DateTime(3)

  category  Category        @relation(fields: [categoryId], references: [id])
  saleItems SaleItem[]
  movements StockMovement[]

  @@index([categoryId, isActive])
  @@index([name])
  @@map("products")
}

model Sale {
  id             Int        @id @default(autoincrement())
  saleDate       DateTime   @map("sale_date") @db.Date       // business day, store timezone
  status         SaleStatus @default(ACTIVE)
  totalAmount    Decimal    @map("total_amount") @db.Decimal(12, 2)
  totalQuantity  Int        @map("total_quantity")
  note           String?    @db.VarChar(500)
  idempotencyKey String?    @unique @map("idempotency_key") @db.VarChar(64)
  createdById    Int        @map("created_by_id")
  createdAt      DateTime   @default(now()) @map("created_at") @db.DateTime(3)
  voidedAt       DateTime?  @map("voided_at") @db.DateTime(3)
  voidedById     Int?       @map("voided_by_id")
  voidReason     String?    @map("void_reason") @db.VarChar(255)

  createdBy User            @relation("SaleCreatedBy", fields: [createdById], references: [id])
  voidedBy  User?           @relation("SaleVoidedBy", fields: [voidedById], references: [id])
  items     SaleItem[]
  movements StockMovement[]

  @@index([saleDate, status])
  @@map("sales")
}

model SaleItem {
  id           Int     @id @default(autoincrement())
  saleId       Int     @map("sale_id")
  productId    Int     @map("product_id")
  categoryId   Int     @map("category_id")                // snapshot of product's category at sale time
  skuSnapshot  String  @map("sku_snapshot") @db.VarChar(40)
  nameSnapshot String  @map("name_snapshot") @db.VarChar(150)
  quantity     Int
  unitPrice    Decimal @map("unit_price") @db.Decimal(12, 2)
  unitCost     Decimal @map("unit_cost") @db.Decimal(12, 2)  // snapshot of product cost at sale time
  lineTotal    Decimal @map("line_total") @db.Decimal(12, 2) // = quantity * unitPrice (server-computed)

  sale     Sale     @relation(fields: [saleId], references: [id])
  product  Product  @relation(fields: [productId], references: [id])
  category Category @relation(fields: [categoryId], references: [id])

  @@index([saleId])
  @@index([productId])
  @@index([categoryId])
  @@map("sale_items")
}

model StockMovement {
  id             Int          @id @default(autoincrement())
  productId      Int          @map("product_id")
  type           MovementType
  quantityChange Int          @map("quantity_change")   // signed: negative for sales
  qtyBefore      Int          @map("qty_before")
  qtyAfter       Int          @map("qty_after")
  unitCost       Decimal?     @map("unit_cost") @db.Decimal(12, 2)  // RESTOCK only
  saleId         Int?         @map("sale_id")                       // SALE / SALE_VOID
  reason         String?      @db.VarChar(255)
  createdById    Int          @map("created_by_id")
  createdAt      DateTime     @default(now()) @map("created_at") @db.DateTime(3)

  product   Product @relation(fields: [productId], references: [id])
  sale      Sale?   @relation(fields: [saleId], references: [id])
  createdBy User    @relation(fields: [createdById], references: [id])

  @@index([productId, createdAt])
  @@index([saleId])
  @@index([type, createdAt])
  @@map("stock_movements")
}

model Setting {
  key       String   @id @db.VarChar(60)
  value     String   @db.VarChar(500)
  updatedAt DateTime @updatedAt @map("updated_at") @db.DateTime(3)

  @@map("settings")
}
```

### 7.3 CHECK constraints (hand-added migration)
Prisma cannot declare CHECK constraints. After the first migration, run `prisma migrate dev --create-only --name add_checks`, paste the SQL below into the generated file, then apply:
```sql
ALTER TABLE products   ADD CONSTRAINT chk_products_stock_nonneg CHECK (stock_qty >= 0);
ALTER TABLE products   ADD CONSTRAINT chk_products_prices       CHECK (selling_price >= 0 AND cost_price >= 0);
ALTER TABLE products   ADD CONSTRAINT chk_products_reorder      CHECK (reorder_level >= 0);
ALTER TABLE sales      ADD CONSTRAINT chk_sales_totals          CHECK (total_amount >= 0 AND total_quantity > 0);
ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_values     CHECK (quantity > 0 AND unit_price >= 0 AND unit_cost >= 0 AND line_total >= 0);
ALTER TABLE stock_movements ADD CONSTRAINT chk_movement_balance CHECK (qty_after = qty_before + quantity_change AND qty_after >= 0);
```
These are a last line of defense; services MUST still validate first so users get friendly errors.

### 7.4 Seed data (`prisma/seed.ts`)
Always seed (idempotent via `upsert`):
- Admin user from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (role `OWNER`, display name "Owner").
- Categories: `Oils (OIL)`, `Mags (MAG)`, `Tires (TIR)`, `Accessories (ACC)`.
- Settings: `store_name`, `low_stock_default` = `5`.

Only if `SEED_SAMPLE_DATA=true` (for demos), create ~12 products via the same service function used by the UI (so `INITIAL` movements are written):

| Category | Name | Brand | Unit | Price | Cost | Stock |
|---|---|---|---|---:|---:|---:|
| Oils | Engine Oil 10W-40 1L | Generic | bottle | 350.00 | 260.00 | 40 |
| Oils | Engine Oil 5W-30 Synthetic 1L | Generic | bottle | 520.00 | 390.00 | 30 |
| Oils | Gear Oil 80W-90 1L | Generic | bottle | 280.00 | 200.00 | 20 |
| Oils | Brake Fluid DOT3 500ml | Generic | bottle | 180.00 | 120.00 | 15 |
| Mags | Mags 15in 4x100 Black | Generic | set | 9500.00 | 7200.00 | 6 |
| Mags | Mags 17in 5x114.3 Chrome | Generic | set | 16500.00 | 12800.00 | 4 |
| Tires | Tire 185/65R15 | Generic | pc | 3200.00 | 2500.00 | 16 |
| Tires | Tire 205/55R16 | Generic | pc | 4100.00 | 3300.00 | 12 |
| Tires | Tire 265/65R17 (SUV) | Generic | pc | 6800.00 | 5400.00 | 8 |
| Accessories | Tire Valve Cap (4pc) | Generic | pack | 60.00 | 30.00 | 50 |
| Accessories | Wiper Blade 20in | Generic | pc | 220.00 | 140.00 | 3 |
| Accessories | Car Air Freshener | Generic | pc | 90.00 | 45.00 | 0 |

(Include one low-stock and one out-of-stock item so the dashboard alerts are demonstrable.)

---

## 8. Business rules

### 8.1 Sales
| ID | Rule |
|---|---|
| BR-01 | **Stock never goes negative.** If any line would take stock below zero, the **entire** sale is rejected (all-or-nothing) with `409 INSUFFICIENT_STOCK` listing each offending product with `requested` and `available`. |
| BR-02 | A sale submission is **atomic**: sale header, items, stock deductions, and movement rows are written in one DB transaction or not at all. |
| BR-03 | **Duplicate lines are merged**: if the same `productId` appears multiple times in one submission, the server sums quantities (per distinct `unitPrice`, see BR-06) before processing. |
| BR-04 | Only **active** products can be sold (`422 PRODUCT_INACTIVE`). Unknown product → `404 NOT_FOUND`. |
| BR-05 | Line quantity is an integer in `1..9999`. A sale has `1..200` lines. |
| BR-06 | `unitPrice` is optional per line; default = product's current `sellingPrice`. An override must be `>= 0`. Lines for the same product with **different** prices are kept as separate sale items (but stock is deducted once per product in total). |
| BR-07 | **Snapshots:** `sale_items` store `skuSnapshot`, `nameSnapshot`, `categoryId`, `unitPrice`, `unitCost` as of sale time. Later product edits never alter past sales. |
| BR-08 | **Sale date** defaults to today (store TZ). Allowed range: `today − 31 days` … `today`. Future dates rejected (`422 INVALID_SALE_DATE`). |
| BR-09 | Multiple sales entries per day are allowed. Day total = sum of `ACTIVE` sales for that `saleDate`. |
| BR-10 | **Idempotency:** the client sends a UUID `idempotencyKey` per submission attempt. If a sale with the same key exists, the server returns that sale (`200`, `replayed: true`) instead of creating another. Prevents double-tap / retry double-deduction. |
| BR-11 | **Sales are immutable.** Corrections = **void** + re-enter. Void requires a `reason` (3–255 chars), is irreversible, and can only happen once (`409 ALREADY_VOIDED`). |
| BR-12 | Voiding **restores stock** with `SALE_VOID` movements (+quantity), even if the product is now inactive. Voided sales are excluded from every total/report but remain visible in history, clearly labeled. |
| BR-13 | **Totals are computed on the server.** Any client-sent `lineTotal`/`totalAmount` is ignored. |

### 8.2 Inventory
| ID | Rule |
|---|---|
| BR-14 | `products.stock_qty` MUST only change inside `inventory.service` functions that also insert a `stock_movements` row **in the same transaction**. No other code may write `stockQty`. |
| BR-15 | **Restock:** quantity `1..99999`; optional `unitCost`; optional flag `updateCostPrice` (default `false`) to also set the product's `costPrice` to `unitCost`. |
| BR-16 | **Adjustment** requires a `reason` (3–255 chars). Two modes: `SET_COUNT` (physical count; server computes delta) and `DELTA` (signed change). Resulting stock MUST be `>= 0`. Zero-change adjustments are rejected (`422`). |
| BR-17 | **Stock status:** `OUT` if `stockQty = 0`; `LOW` if `0 < stockQty <= reorderLevel`; else `OK`. |
| BR-18 | Creating a product with `initialStock > 0` writes an `INITIAL` movement. |
| BR-19 | `stockQty` is **not** accepted by the product edit endpoint. Stock changes go through restock/adjust only. |

### 8.3 Catalog
| ID | Rule |
|---|---|
| BR-20 | `sku` is unique (case-insensitive). If omitted on create, auto-generate `"{CATEGORY_CODE}-{id padded to 5}"` (e.g. `OIL-00012`). |
| BR-21 | Products are **never hard-deleted**. Deactivate instead (hidden from sales entry and "active" lists; kept in history). Deactivating with stock `> 0` is allowed (UI warns). |
| BR-22 | Categories have **no delete**. They can be renamed; they can be deactivated only if they have no active products. Category `code` is immutable after creation. |
| BR-23 | `sellingPrice` and `costPrice` are in `0.00..9,999,999.99`. |
| BR-24 | Product names SHOULD be unique per category+brand; on conflict the API returns a `409 DUPLICATE_PRODUCT_NAME` warning that the client may override with `allowDuplicateName: true`. |

### 8.4 Reporting
| ID | Rule |
|---|---|
| BR-25 | **Revenue** = `SUM(sale_items.line_total)` over `ACTIVE` sales in the period. |
| BR-26 | **Estimated gross profit** = `SUM(line_total − quantity × unit_cost)` over `ACTIVE` sales. If any included item has `unit_cost = 0`, return `profitWarning: true` and the UI shows "some products have no cost price". |
| BR-27 | **Items sold** = `SUM(quantity)` over `ACTIVE` sale items. **Entries** = count of `ACTIVE` sales. |
| BR-28 | Trend series MUST include every calendar day in range; days with no sales are `0`. |

---

## 9. Core flows & logic

### 9.1 End-of-day sales submission (the primary flow)

**User story:** *"At closing, the owner opens Enter Sales, picks 'Engine Oil 10W-40 1L', types 3, adds 'Tire 185/65R15', types 2, taps Save. Inventory drops automatically. The dashboard shows today's sales."*

**Sequence**
```
Client                      API (POST /api/sales)                 DB
  │ generate idempotencyKey (uuid, once per form session)
  │ validate form (Zod) ─────────────────────────────────────────►
  │──────────────────────────► requireAuth()
  │                            Zod parse (createSaleSchema)
  │                            salesService.createSale(input, user)
  │                              1. replay check by idempotencyKey ─────► SELECT sale
  │                              2. validate saleDate range (BR-08)
  │                              3. $transaction {
  │                                   a. load products (ids), assert exist + active
  │                                   b. per product (ASC id, avoids deadlocks):
  │                                        atomic guarded UPDATE ─────────► UPDATE ... WHERE stock_qty >= ?
  │                                        if 0 rows → INSUFFICIENT_STOCK (rollback all)
  │                                        read new stock_qty
  │                                   c. insert sale (+ totals computed server-side)
  │                                   d. insert sale_items (snapshots)
  │                                   e. insert stock_movements (SALE, negative)
  │                                 }
  │◄────────────── 201 { sale, stockUpdates[] }
  │ invalidate queries → dashboard/inventory refresh
```

**Reference implementation (guide, adapt to Prisma version)**
```ts
// server/services/sales.service.ts
export async function createSale(input: CreateSaleInput, user: SessionUser) {
  const existing = input.idempotencyKey
    ? await db.sale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: saleInclude })
    : null;
  if (existing) return { sale: serializeSale(existing), replayed: true };

  assertSaleDateInRange(input.saleDate);                       // BR-08

  // Total quantity per product for stock deduction (BR-03)
  const qtyByProduct = new Map<number, number>();
  for (const l of input.items) qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.quantity);

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: [...qtyByProduct.keys()] } } });
    // BR-04: missing -> NotFoundError, inactive -> ProductInactiveError
    const byId = new Map(products.map((p) => [p.id, p]));

    const shortages: Shortage[] = [];
    const balances = new Map<number, { before: number; after: number }>();

    for (const productId of [...qtyByProduct.keys()].sort((a, b) => a - b)) {
      const qty = qtyByProduct.get(productId)!;
      const res = await tx.product.updateMany({
        where: { id: productId, isActive: true, stockQty: { gte: qty } },   // atomic guard (BR-01)
        data: { stockQty: { decrement: qty } },
      });
      if (res.count === 0) {
        const cur = await tx.product.findUnique({ where: { id: productId }, select: { stockQty: true } });
        shortages.push({ productId, requested: qty, available: cur?.stockQty ?? 0 });
        continue;
      }
      const after = (await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQty: true } })).stockQty;
      balances.set(productId, { before: after + qty, after });
    }
    if (shortages.length) throw new InsufficientStockError(shortages);     // rolls back every decrement

    // Build items with snapshots; compute money with Prisma.Decimal (BR-13)
    // totalAmount = Σ(quantity × unitPrice), totalQuantity = Σ(quantity)
    const sale = await tx.sale.create({ data: { /* header + nested items */ } });
    // One SALE movement per product (not per line): quantityChange = -qtyByProduct[productId]
    await tx.stockMovement.createMany({ data: /* ... */ });
    return { sale: serializeSale(sale), replayed: false, stockUpdates: /* productId, newQty, status */ };
  }, { timeout: 15_000, maxWait: 5_000 });
}
```

**Edge cases the implementation MUST handle**
| Case | Behavior |
|---|---|
| Two requests race for the last unit | Exactly one succeeds; the other gets `409 INSUFFICIENT_STOCK`. (Covered by a concurrency test.) |
| Same request sent twice (double-tap/retry) | Second returns the first sale with `replayed: true`; stock deducted once. |
| Product deactivated between page load and submit | `422 PRODUCT_INACTIVE` naming the product. |
| Empty items array / zero quantity | `400 VALIDATION_ERROR`. |
| Sale date in the future | `422 INVALID_SALE_DATE`. |
| Unique-key violation on `idempotencyKey` due to a race | Catch Prisma `P2002`, re-read by key, return as replay. |

### 9.2 Void a sale
1. `POST /api/sales/:id/void {reason}` (OWNER only).
2. In one transaction:
   - Guarded status flip: `updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'VOIDED', voidedAt, voidedById, voidReason } })`. If `count = 0` → `409 ALREADY_VOIDED` (or `404` if no such sale).
   - Aggregate items by `productId`; for each (ASC id): `updateMany({ where: { id: productId }, data: { stockQty: { increment: qty } } })`, read new qty, insert `SALE_VOID` movement (`+qty`, `saleId`, `reason`).
3. Return the voided sale. Dashboards exclude it immediately (BR-12).

### 9.3 Restock (stock received)
`POST /api/inventory/restock` with `items: [{ productId, quantity, unitCost? , updateCostPrice? }]` and optional `note`:
- One transaction. Per item: increment `stockQty`, insert `RESTOCK` movement (`unitCost`, `reason = note`). If `updateCostPrice` and `unitCost` provided → update `product.costPrice`.
- Inactive products MAY be restocked (they stay inactive).

### 9.4 Adjustment (physical count / correction)
`POST /api/inventory/adjust { productId, mode, value, reason }`
- `SET_COUNT`: `delta = value − current`. `DELTA`: `delta = value` (signed).
- Reject if `delta = 0` or resulting stock `< 0`.
- Guarded update (`stockQty >= -delta` when delta negative) → insert `ADJUSTMENT` movement.

### 9.5 Create / edit product
- **Create:** validate; resolve category (must be active); generate SKU if omitted (insert with temporary SKU `TMP-{uuid}` then update to `{CODE}-{id:05}` inside the same transaction); insert product with `stockQty = 0`; if `initialStock > 0` run the restock-style increment with an `INITIAL` movement.
- **Edit:** allowed fields: `name, brand, categoryId, unit, sellingPrice, costPrice, reorderLevel, notes, isActive`. Changing `sellingPrice` affects only future sales (BR-07). `stockQty` and `sku` are not editable here (SKU change MAY be allowed for OWNER if unique — optional).

### 9.6 Dashboard aggregation (read model)
All queries filter `sales.status = 'ACTIVE'`. Reference SQL (use Prisma `groupBy`/`$queryRaw` with **parameterized** values only):
```sql
-- Summary for a day
SELECT COALESCE(SUM(si.line_total),0) AS revenue,
       COALESCE(SUM(si.quantity),0)   AS items_sold,
       COALESCE(SUM(si.line_total - si.quantity * si.unit_cost),0) AS gross_profit,
       COUNT(DISTINCT s.id)           AS entries,
       COALESCE(SUM(si.unit_cost = 0),0) > 0 AS profit_warning
FROM sales s JOIN sale_items si ON si.sale_id = s.id
WHERE s.status = 'ACTIVE' AND s.sale_date = ?;

-- By category
SELECT c.id, c.name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN categories c ON c.id = si.category_id
WHERE s.status = 'ACTIVE' AND s.sale_date = ?
GROUP BY c.id, c.name ORDER BY revenue DESC;

-- Per-product (top products + "items sold" table)
SELECT si.product_id, si.name_snapshot, si.sku_snapshot, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
FROM sale_items si JOIN sales s ON s.id = si.sale_id
WHERE s.status = 'ACTIVE' AND s.sale_date = ?
GROUP BY si.product_id, si.name_snapshot, si.sku_snapshot ORDER BY qty DESC;

-- Trend (fill missing days with 0 in code — BR-28)
SELECT s.sale_date, SUM(si.line_total) AS revenue, SUM(si.quantity) AS qty
FROM sales s JOIN sale_items si ON si.sale_id = s.id
WHERE s.status = 'ACTIVE' AND s.sale_date BETWEEN ? AND ?
GROUP BY s.sale_date ORDER BY s.sale_date;
```
Note: `COUNT(DISTINCT s.id)` and `SUM` across the join are correct because totals are summed from `sale_items` only (never from `sales.total_amount`, which would double count).

---

## 10. API specification

### 10.1 Conventions
- Base path `/api`. JSON only. All endpoints require auth **except** `POST /api/auth/login`.
- **Success envelope:** `{ "data": <payload>, "meta"?: { page, pageSize, total, totalPages } }`
- **Error envelope:** `{ "error": { "code": "STRING_CODE", "message": "Human readable", "details"?: any } }`
- Money = string with 2 decimals; dates = `YYYY-MM-DD`; timestamps = ISO 8601 UTC.
- Pagination: `?page=1&pageSize=20` (max 100). Sorting: `?sort=name&order=asc`.
- Every mutating handler checks the `Origin` header equals the app origin (CSRF defense in addition to `SameSite=Lax`) and requires `Content-Type: application/json`.
- Each handler uses `withApi({ auth: 'any' | 'OWNER' }, handler)`.

### 10.2 Error codes
| HTTP | `code` | When |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Zod failure. `details` = field errors. |
| 401 | `UNAUTHORIZED` | Missing/invalid session. |
| 403 | `FORBIDDEN` | Role lacks permission. |
| 404 | `NOT_FOUND` | Entity missing. |
| 409 | `INSUFFICIENT_STOCK` | `details.shortages = [{productId, name, requested, available}]` |
| 409 | `ALREADY_VOIDED` | Void on a voided sale. |
| 409 | `DUPLICATE_SKU` | SKU exists. |
| 409 | `DUPLICATE_PRODUCT_NAME` | BR-24 (overridable). |
| 409 | `CATEGORY_IN_USE` | Deactivating category with active products. |
| 422 | `PRODUCT_INACTIVE` | Selling an inactive product. |
| 422 | `INVALID_SALE_DATE` | BR-08. |
| 422 | `INVALID_ADJUSTMENT` | Zero delta or negative result. |
| 429 | `RATE_LIMITED` | Too many login attempts. |
| 500 | `INTERNAL_ERROR` | Unexpected; log server-side, never leak stack traces. |

### 10.3 Endpoints

#### Auth
| Method & path | Body → Response |
|---|---|
| `POST /api/auth/login` | `{ username, password }` → sets cookie; `{ data: { user } }` |
| `POST /api/auth/logout` | clears cookie |
| `GET /api/auth/me` | `{ data: { id, username, displayName, role } }` |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` (min 8 chars) |

#### Categories
| Method & path | Notes |
|---|---|
| `GET /api/categories?includeInactive=false` | Ordered by `sortOrder, name`. Includes `productCount`. |
| `POST /api/categories` (OWNER) | `{ name, code }` — `code` 2–5 chars `A–Z0-9`, unique. |
| `PATCH /api/categories/:id` (OWNER) | `{ name?, sortOrder?, isActive? }` (BR-22). |

#### Products
| Method & path | Notes |
|---|---|
| `GET /api/products` | Query: `search` (name/sku/brand), `categoryId`, `status=active\|inactive\|all` (default `active`), `stock=all\|low\|out`, paging, sort. |
| `GET /api/products/lookup?q=&categoryId=&limit=20` | **Lightweight, active only** — feeds the sales-entry combobox. |
| `POST /api/products` (OWNER) | `{ name, brand?, categoryId, unit, sellingPrice, costPrice?, initialStock?, reorderLevel?, sku?, notes?, allowDuplicateName? }` |
| `GET /api/products/:id` | Product + recent movements (last 10). |
| `PATCH /api/products/:id` (OWNER) | Fields per 9.5. |

Product object:
```json
{
  "id": 3, "sku": "OIL-00003", "name": "Gear Oil 80W-90 1L", "brand": "Generic",
  "category": { "id": 1, "name": "Oils", "code": "OIL" },
  "unit": "bottle", "sellingPrice": "280.00", "costPrice": "200.00",
  "stockQty": 20, "reorderLevel": 5, "stockStatus": "OK", "isActive": true,
  "notes": null, "createdAt": "2026-10-16T01:10:00.000Z", "updatedAt": "2026-10-16T01:10:00.000Z"
}
```
Lookup item: `{ id, sku, name, brand, category:{id,name}, unit, sellingPrice, stockQty, stockStatus }`.

#### Inventory
| Method & path | Notes |
|---|---|
| `GET /api/inventory/summary` | `{ totalSkus, totalUnits, stockValueAtCost (OWNER), lowCount, outCount }` over active products. |
| `GET /api/inventory/low-stock?limit=10` | Products with status `LOW` or `OUT`, `OUT` first, then ascending `stockQty`. |
| `POST /api/inventory/restock` (OWNER) | `{ items:[{productId, quantity, unitCost?, updateCostPrice?}], note? }` |
| `POST /api/inventory/adjust` (OWNER) | `{ productId, mode:"SET_COUNT"\|"DELTA", value, reason }` |
| `GET /api/inventory/movements` | Query: `productId`, `type`, `from`, `to`, paging. Newest first. |

#### Sales
| Method & path | Notes |
|---|---|
| `POST /api/sales` | Create end-of-day entry (see below). |
| `GET /api/sales` | Query: `from`, `to`, `status=active\|voided\|all`, paging. Newest `saleDate`, then `createdAt`. |
| `GET /api/sales/:id` | Header + items + creator + void info. |
| `POST /api/sales/:id/void` (OWNER) | `{ reason }` |

**`POST /api/sales` request**
```json
{
  "saleDate": "2026-10-16",
  "idempotencyKey": "3b0c8f9e-6a4e-4c53-9d2a-6c1c8b2a9f10",
  "note": "Saturday closing",
  "items": [
    { "productId": 1, "quantity": 3 },
    { "productId": 7, "quantity": 2, "unitPrice": "3100.00" }
  ]
}
```
**201 response**
```json
{
  "data": {
    "replayed": false,
    "sale": {
      "id": 41, "saleDate": "2026-10-16", "status": "ACTIVE",
      "totalAmount": "7250.00", "totalQuantity": 5, "note": "Saturday closing",
      "items": [
        { "productId": 1, "sku": "OIL-00001", "name": "Engine Oil 10W-40 1L", "quantity": 3, "unitPrice": "350.00", "lineTotal": "1050.00" },
        { "productId": 7, "sku": "TIR-00007", "name": "Tire 185/65R15", "quantity": 2, "unitPrice": "3100.00", "lineTotal": "6200.00" }
      ]
    },
    "stockUpdates": [
      { "productId": 1, "stockQty": 37, "stockStatus": "OK" },
      { "productId": 7, "stockQty": 14, "stockStatus": "OK" }
    ]
  }
}
```
**409 response example**
```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Not enough stock for 1 product.",
  "details": { "shortages": [ { "productId": 7, "name": "Tire 185/65R15", "requested": 20, "available": 14 } ] } } }
```

#### Dashboard
| Method & path | Notes |
|---|---|
| `GET /api/dashboard/daily?date=YYYY-MM-DD` | Default today (store TZ). Payload below. |
| `GET /api/dashboard/trend?endDate=YYYY-MM-DD&days=7` | `days` ∈ {7, 14, 30}. Zero-filled series (BR-28). |

**Daily payload**
```json
{
  "date": "2026-10-16",
  "summary": { "revenue": "12450.00", "itemsSold": 31, "entries": 1, "grossProfit": "3120.00", "profitWarning": false },
  "comparison": { "previousDate": "2026-10-15", "previousRevenue": "9800.00", "changePct": 27.04 },
  "byCategory": [ { "categoryId": 1, "name": "Oils", "quantity": 14, "revenue": "5600.00", "sharePct": 44.98 } ],
  "topProducts": [ { "productId": 1, "sku": "OIL-00001", "name": "Engine Oil 10W-40 1L", "quantity": 6, "revenue": "2100.00" } ],
  "items": [ { "productId": 1, "name": "Engine Oil 10W-40 1L", "category": "Oils", "quantity": 6, "revenue": "2100.00" } ],
  "inventory": { "totalSkus": 12, "totalUnits": 204, "lowCount": 2, "outCount": 1 },
  "lowStock": [ { "productId": 12, "name": "Car Air Freshener", "stockQty": 0, "reorderLevel": 5, "stockStatus": "OUT" } ]
}
```
`changePct` is `null` when the previous day's revenue is `0`. `grossProfit` and `profitWarning` are omitted for `STAFF`.

#### Reports & settings
| Method & path | Notes |
|---|---|
| `GET /api/reports/sales?from=&to=&groupBy=day\|category\|product` | Aggregations using the same rules as the dashboard. |
| `GET /api/reports/export?type=sales\|products\|movements&from=&to=` (OWNER) | Streams CSV (UTF-8 with BOM so Excel opens it correctly). |
| `GET /api/settings` / `PATCH /api/settings` (OWNER) | `{ storeName, lowStockDefault }`. |

### 10.4 Key Zod schemas (`src/schemas/`)
```ts
export const moneyString = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Invalid amount");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const saleItemInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(9999),
  unitPrice: moneyString.optional(),
});

export const createSaleSchema = z.object({
  saleDate: isoDate,
  idempotencyKey: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
  items: z.array(saleItemInput).min(1).max(200),
});

export const restockSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(99999),
    unitCost: moneyString.optional(),
    updateCostPrice: z.boolean().optional(),
  })).min(1).max(100),
  note: z.string().trim().max(255).optional(),
});

export const adjustSchema = z.object({
  productId: z.number().int().positive(),
  mode: z.enum(["SET_COUNT", "DELTA"]),
  value: z.number().int(),              // SET_COUNT: >= 0 ; DELTA: non-zero signed
  reason: z.string().trim().min(3).max(255),
});

export const voidSaleSchema = z.object({ reason: z.string().trim().min(3).max(255) });
```

---

## 11. Frontend specification

### 11.1 Navigation
- **Desktop (≥ 768px):** left sidebar. **Mobile:** bottom tab bar with 4 items + "More".
- Items: **Dashboard** · **Enter Sales** (highlighted primary action) · **Inventory** · **Products** · Sales History · Reports · Settings.
- Default landing page after login: `/dashboard`. A persistent **"+ Enter Sales"** button is visible on the dashboard.

### 11.2 Page: Enter Sales (`/sales/new`) — the most important screen
**Wireframe**
```
┌───────────────────────────────────────────────────────────┐
│ Enter Sales                         Date: [ Oct 16, 2026 ]│
├───────────────────────────────────────────────────────────┤
│ Product                    Stock   Qty   Price     Total  │
│ [Engine Oil 10W-40 1L  ▾]   40    [ 3 ]  ₱350.00  ₱1,050  ✕│
│ [Tire 185/65R15        ▾]   16    [ 2 ]  ₱3,200   ₱6,400  ✕│
│ [ + Add item ]                                            │
├───────────────────────────────────────────────────────────┤
│ Note (optional) [______________________________]          │
│ Items: 5                              Total: ₱7,450.00     │
│                                        [ Review & Save ]   │
└───────────────────────────────────────────────────────────┘
```
**Behavior (MUST)**
1. Page starts with **one empty row** focused. Date defaults to today (store TZ); picker limited to `today−31d … today` (BR-08). If date ≠ today show a yellow notice "You're entering sales for a past date."
2. **Product combobox**: type to search by name/SKU/brand (debounced 200ms, calls `/api/products/lookup`), plus category filter chips (All · Oils · Mags · Tires · …). Shows `name · brand · ₱price · stock`. Out-of-stock items are shown but disabled with "Out of stock".
3. Selecting a product fills `Stock` (read-only, live from lookup) and `Price` (editable; default selling price). `Qty` defaults to `1`, numeric keypad on mobile (`inputMode="numeric"`), stepper buttons, range `1..9999`.
4. **Row total** = qty × price; **grand total** and **items count** update instantly (display-only; server recomputes).
5. **Inline stock warning:** if `qty > stock` show red "Only N in stock" and disable submit. The server still enforces BR-01.
6. **Duplicate product handling:** if the user picks a product already in another row, auto-focus that existing row and add +1 instead of creating a duplicate (server also merges, BR-03).
7. Enter in the Qty field adds a new row and focuses its product field (fast keyboard entry). Remove a row with ✕. At least one valid row required.
8. **Review & Save** opens a confirm dialog listing lines, total and date. Confirm → `POST /api/sales` with the form-session `idempotencyKey` (generated once when the page mounts; regenerated only after a *successful* save). Disable the button while pending (double-tap guard).
9. **On success:** show success screen: "Saved ✓ — 5 items, ₱7,450.00" with buttons **Enter another** (resets form + new key) and **View dashboard**. Invalidate queries (Section 6.4).
10. **On `INSUFFICIENT_STOCK`:** keep the form, highlight the offending rows with "Only N available", and refresh lookup data.
11. Unsaved-changes guard on navigation.

### 11.3 Page: Dashboard (`/dashboard`)
**Wireframe**
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard            [◀] [ Today · Oct 16, 2026 ▾] [▶]  [+ Enter Sales] │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Sales        │ Items sold   │ Entries      │ Est. profit    │
│ ₱12,450.00   │ 31           │ 1            │ ₱3,120.00      │
│ ▲ 27% vs yest│              │              │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ Last 7 days (line)                │ Sales by category (donut)│
├────────────────────────────────────┼─────────────────────────┤
│ Items sold today (table)           │ ⚠ Low / out of stock     │
│ Product · Category · Qty · Revenue │ Car Air Freshener  OUT   │
│ ...                                │ Wiper Blade 20in   3 left│
└────────────────────────────────────┴─────────────────────────┘
```
**Behavior:** date navigator (prev/next/today/date-picker; cannot go beyond today). KPI cards, trend chart (7/14/30 toggle), category donut with legend and % share, top products bar (top 5), "items sold" table sorted by quantity, low-stock panel linking to restock. Empty state when no sales: "No sales recorded for this day yet" + **Enter Sales** button. Hide profit card for `STAFF`. Show profit warning tooltip when `profitWarning`. Auto-refresh per Section 6.4.

### 11.4 Page: Inventory (`/inventory`) — live stock view
Summary cards (SKUs, units, stock value at cost [OWNER], low, out). Table: Product · Category · Stock (with status badge OK/LOW/OUT) · Reorder level · Price · Actions (Restock, Adjust, History). Filters: search, category, stock status (All/Low/Out). Sorted by status severity by default. Row action dialogs call `/restock` and `/adjust`. `/inventory/restock` provides a multi-row "stock received" form (same row component pattern as sales entry). `/inventory/movements` shows the ledger with filters; `SALE` rows link to the sale, quantities colored (green +, red −).

### 11.5 Page: Products (`/products`, `/products/new`, `/products/[id]`)
List with search, category filter, active/inactive toggle, pagination. Form fields per Section 10.3 with inline Zod validation; `initialStock` only on create. On edit, stock is displayed read-only with links to Restock/Adjust. Deactivate/Activate button with confirm dialog (warn when stock > 0). Show margin preview (`price − cost`) in the form (OWNER).

### 11.6 Page: Sales History (`/sales`, `/sales/[id]`)
Filterable list (date range, status). Columns: Date · Entry # · Items · Total · Status · Created by. Voided rows are greyed with a "VOIDED" badge. Detail page shows line items, totals, creator, timestamps; **Void sale** button (OWNER, only if ACTIVE) opens dialog requiring a reason and explaining "This will return the items to stock."

### 11.7 Page: Reports (`/reports`)
Date-range picker (presets: Today, Last 7 days, This month, Last month, Custom). Tabs: **By day**, **By category**, **By product**. Table + chart, totals row, **Export CSV** (OWNER).

### 11.8 Page: Settings (`/settings`)
Store name, default reorder level for new products, change password, category management (add/rename/reorder/deactivate).

### 11.9 UX & quality requirements
- Mobile-first, tap targets ≥ 44px, readable at 360px width.
- Every list has loading (skeleton), empty, and error states with retry.
- Destructive/irreversible actions (void, deactivate) require a confirm dialog.
- Use toast notifications for success/failure of mutations.
- Format all money with `lib/money.ts`; all dates with store timezone.
- Accessible: labels on inputs, keyboard navigable combobox, color is never the only status indicator (use text badges too).
- Client state: server state in TanStack Query; forms in React Hook Form; no global store needed.

### 11.10 TanStack Query keys
`['dashboard','daily',date]` · `['dashboard','trend',endDate,days]` · `['products',filters]` · `['products','lookup',q,categoryId]` · `['inventory','summary']` · `['inventory','low-stock']` · `['inventory','movements',filters]` · `['sales',filters]` · `['sales',id]` · `['categories']` · `['settings']`.

---

## 12. Metric definitions (single source for dashboard & reports)

| Metric | Definition | Rule |
|---|---|---|
| Sales (revenue) | Σ `sale_items.line_total`, ACTIVE sales, in period | BR-25 |
| Items sold | Σ `sale_items.quantity`, ACTIVE | BR-27 |
| Entries | Count of ACTIVE `sales` | BR-27 |
| Est. gross profit | Σ `line_total − quantity × unit_cost` | BR-26 |
| Change vs previous day | `(today − prev) / prev × 100`, 2 decimals; `null` if prev = 0 | — |
| Category share % | category revenue ÷ day revenue × 100 | — |
| Stock value at cost | Σ `stock_qty × cost_price` over active products | OWNER only |
| Stock status | OUT / LOW / OK | BR-17 |


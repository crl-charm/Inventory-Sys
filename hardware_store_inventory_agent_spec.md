# Hardware Store Inventory & Daily Sales System — Agent Build Specification

> **Purpose:** Build a small, dependable inventory and daily-sales web app for a hardware/automotive-supply store. Replace the owner's notebook and pen with a simple screen where they record the quantity sold for each product at the end of the day. Saving the entry immediately reduces stock and updates the daily sales report.
>
> **Primary stack:** Next.js App Router, TypeScript, MySQL-compatible database provided by XAMPP (current XAMPP distributions commonly bundle MariaDB), `mysql2/promise`, and Tailwind CSS.
>
> **Build style:** Make the core workflow exceptionally simple. Do not turn this into a full accounting, purchasing, warehouse, or point-of-sale platform.

---

## 1. Product vision and the core workflow

The owner sells different kinds of products, for example:

- Engine oil and other automotive fluids
- Mags / wheels / rims
- Tires
- Other hardware and automotive supplies

Today, the owner writes down the products and quantities sold using a notebook. The system should replace that daily manual process.

### The main scenario

1. The owner adds a product to the system, for example **Engine Oil 1L**, with its category, unit, selling price, and starting stock.
2. The inventory screen shows the current available quantity.
3. At the end of the day, the owner opens **Record Daily Sales**.
4. The owner selects the business date and enters the quantity sold for each product. Example: Engine Oil 1L = `3`, Tire 14-inch = `2`, Mag 15-inch = `1`.
5. The app calculates each line's total using the saved selling price, calculates the day's sales total, checks stock, and saves the entire entry.
6. The app automatically deducts each quantity from stock and records every stock movement.
7. The dashboard and reports immediately display the updated figures.

### Important meaning of “live inventory”

In this MVP, inventory is updated **immediately when the daily sales entry is saved**. Because the owner enters totals at the end of the day, the system cannot know what was sold earlier in the day until those quantities are entered. It is not a live cashier/POS system. If the owner later wants stock to change at the moment each customer buys an item, add a POS workflow in a future phase.

### Example

Assume Engine Oil 1L has 20 bottles in stock and a selling price of ₱350 each.

- Owner enters quantity sold: `3`
- Line total: `3 × ₱350 = ₱1,050`
- Stock before: `20`
- Stock after saving: `17`
- Today's sales increases by ₱1,050

No one should need to calculate the subtotal or manually update stock with a calculator.

---

## 2. Product goals

### Must-have goals

1. Maintain a product catalog with categories, names, optional SKU/code, unit, selling price, stock-on-hand, and low-stock threshold.
2. Let the owner record a day's sales in one batch containing multiple products.
3. Deduct inventory automatically after a valid sales batch is saved.
4. Calculate daily sales totals automatically, using the selling price at the time the sale is recorded.
5. Show current stock, low-stock products, out-of-stock products, recent sales entries, and daily totals.
6. Provide sales history by date and a daily report that can be printed.
7. Let the owner record additional stock and correct stock after a physical count.
8. Preserve a stock-movement history so the owner can see why a quantity changed.
9. Prevent overselling, duplicate submission, negative quantities, and silent data corruption.
10. Run locally on Windows with Next.js and the database managed using XAMPP/phpMyAdmin.

### Not included in the first version

Do **not** build these unless the owner asks for them later:

- Barcode scanning
- Cashier/POS screen or receipt printer
- Supplier purchase orders
- Customer accounts, credit, or receivables
- Payroll, expenses, tax filing, or full accounting
- Multi-branch inventory
- Online payments
- Offline-first/PWA synchronization
- Complex employee permissions
- Product bundles or automatic unit conversions

Do not add features merely because they are common in larger inventory platforms. Prioritize the daily sales entry, reliable stock deduction, and clear sales summary.

---

## 3. Assumptions and business rules

Use these defaults unless the project owner supplies different requirements.

1. **Single store:** One inventory location and one store currency: Philippine peso (PHP, shown as `₱`).
2. **Business timezone:** `Asia/Manila`.
3. **Daily totals, not individual receipts:** An entry represents the quantity sold per product for a selected business date. The system does not need customer names or one record per customer.
4. **One batch can contain many products:** For a selected date, the owner can enter quantities for multiple products and save them together.
5. **Several batches on one date are allowed:** This permits a correction or a second entry later. Display a warning when the date already has a posted batch to reduce accidental duplicate entries.
6. **Price source:** By default, line price comes from the product's current selling price. Store a snapshot of the applied price on each sale line so a later price change will not change past sales totals. Allow an optional per-line actual selling price override in case that day's price was different.
7. **No negative stock:** If any line asks to sell more than its available stock, reject the whole batch and clearly identify the product. Do not save only part of the batch.
8. **No hard deletion of history:** Posted sales are voided with a reason, not deleted. Voiding restores inventory and excludes that batch from sales totals while retaining the audit record.
9. **Product deletion:** Products with sale or movement history cannot be permanently deleted. Let the owner deactivate them instead.
10. **Stock is quantity-based:** Each product has one base unit such as `piece`, `bottle`, `pair`, `set`, `box`, `pack`, `liter`, or `gallon`. Do not assume that a box equals a fixed number of pieces. If the owner sells a bottle and a gallon as different products, register them as separate products or variants.
11. **Daily entry sequence:** The owner should record each day's sales as part of the normal end-of-day process. The chosen sales date affects reports; saving a historical-dated entry still deducts the quantities from the current on-hand balance at the time it is saved. Do not silently recalculate prior stock balances based on dates.
12. **Revenue is not profit:** The first version reports recorded sales revenue, not net profit. Do not call sales revenue “profit.”
13. **Starting inventory:** Every new product begins with a specified opening quantity (which can be zero). Record a corresponding opening-stock movement in the stock history.
14. **Stock availability is authoritative on the server:** The UI's shown quantity is informational; the sales API must verify stock again while saving.

---

## 4. User experience and screens

Build a responsive, practical interface. It should work well on the owner's laptop and remain usable on a phone or tablet.

### 4.1 Login

Use a single owner account in the MVP. Do not provide public registration. Store only a password hash, never a plain-text password. Provide a setup/seed command to create the initial owner account. A local-only app can technically run without login, but default to authentication so other users on the same network cannot casually edit the store's records.

### 4.2 Dashboard (`/dashboard`)

Show these cards at the top:

- **Sales today** — sum of posted sale totals for today's `sale_date`.
- **Sales for selected date** — controlled by a date picker; defaults to today.
- **Active products** — count of active products.
- **Low-stock products** — active products whose stock is greater than zero and less than or equal to their reorder level.
- **Out of stock** — active products with stock-on-hand equal to zero.

Below the cards:

- **Today's sales by product:** product name, SKU/code if provided, quantity sold with its unit, selling price, line total.
- **Low stock to review:** product, available quantity, unit, reorder level.
- **Recent sales entries:** date, saved time, total, status, and an action to view details.
- A highly visible **Record Daily Sales** button.

Do not show an unqualified “total items sold” as the only sales volume metric: bottles, tires, liters, and pairs are different units. Show quantities grouped by product with the unit label.

### 4.3 Inventory (`/inventory`)

Table columns:

- Product name
- SKU/code (optional)
- Category
- Brand/variant (optional)
- Unit
- Selling price
- Stock on hand
- Reorder level
- Stock status
- Actions: View/Edit, Stock In, Physical Count, Deactivate

Features:

- Search by product name, SKU, brand, or variant.
- Filter by category and stock status (`All`, `In stock`, `Low stock`, `Out of stock`).
- Sort by name, available quantity, or price.
- Show a clear empty state with **Add your first product**.
- Out-of-stock and low-stock states must be distinguishable without relying on color alone.
- Never silently remove products from this list. Deactivated products remain visible with an inactive label when the owner selects that filter.

### 4.4 Add/Edit Product (`/inventory/new`, `/inventory/[id]/edit`)

Fields:

- Product name — required.
- Category — required; allow the owner to add a category if needed.
- SKU/product code — optional, unique when present.
- Brand — optional.
- Variant/specification — optional, for example `1L`, `14-inch`, `15-inch`, `205/55R16`.
- Unit — required, selected from common units but allow a custom label.
- Selling price — required, must be zero or greater; visually encourage a positive value for normal sale products.
- Opening stock — required on creation; zero is allowed.
- Reorder level — required, zero or greater; defaults to `5` only as an editable suggestion, not a universal business rule.
- Active/inactive — edit only.

After creating a product with opening stock greater than zero, record an opening movement. Do not create an opening movement when merely editing a product's name or price.

### 4.5 Record Daily Sales (`/sales/new`)

This is the most important screen. Make it fast and forgiving.

Layout:

1. Heading: **Record Daily Sales**.
2. Date picker, defaulting to the current date in `Asia/Manila`.
3. Optional notes field, e.g. `Notebook total checked by owner`.
4. Searchable product selector.
5. Sales table with one row per product:
   - Product
   - Available stock before saving
   - Unit
   - Quantity sold (user input)
   - Unit selling price (pre-filled; can be edited for this entry)
   - Line total (calculated immediately)
   - Remove row action
6. Total sales amount displayed prominently.
7. **Save Sales & Update Inventory** primary action.

Behavior:

- The owner searches for a product, selects it, and enters a quantity. Example: `Engine Oil 1L` and `3`.
- Quantity must be greater than zero. Reject zero or negative quantities in a submitted sale line; remove unused rows instead.
- Do not allow the same product to appear twice in the same batch. If the user selects it again, focus the existing row or combine quantities with a confirmation.
- Display the product's current stock beside the quantity input.
- Recalculate line totals and batch total as the owner types. This is a UI preview only; the server recalculates every amount before storing it.
- Warn if the selected date already has sales entries: `Sales have already been recorded for this date. Confirm this is an additional entry before saving.`
- On successful save, show a summary (date, total, products and quantities), clear the form, and refresh the dashboard/stock values.
- Prevent repeated clicks while saving. Also enforce duplicate-request protection where practical, such as a unique client-generated request ID stored with the batch.
- If a stock shortage occurs, do not save any line. Display the product, requested quantity, and available quantity and let the owner correct the entry.
- If the owner is recording sales for a date in the past, explain in the UI that saving will deduct the entered quantities from current inventory.

### 4.6 Sales History (`/sales`)

Display posted and voided batches with:

- Sale date
- Date/time the entry was recorded
- Total amount
- Number of different product lines
- Status (`Posted` / `Voided`)
- View details action

Allow filtering by date range and status. The details page shows all product quantities, units, applied selling prices, line totals, batch total, notes, created time, and void information where relevant.

For a correction, do not silently edit already-posted sale lines. Provide **Void entry** with a required reason, restore quantities to stock automatically, then ask the owner to create the corrected sales entry. A second void attempt must fail safely.

### 4.7 Stock In and Physical Count (`/inventory` actions)

Two simple stock actions are required:

**A. Stock In** — when more stock arrives.

- Product
- Quantity received, greater than zero
- Optional reason/reference, e.g. `New delivery`
- Save action
- On save: add quantity to stock and add a positive `stock_in` movement.

**B. Physical Count / Stock Correction** — when the owner counts the shelf and the system's quantity differs.

- Show current system quantity.
- Ask for the actual physically counted quantity (zero is valid).
- Require a reason, e.g. `Physical count correction` or `Damaged stock`.
- Server calculates `delta = physical_count - current_stock` while locking the product row.
- Update on-hand quantity to the entered physical count and log the signed movement (`delta` can be negative or positive).
- Never let physical count be negative.

Never let users directly type into the stock value on the product edit form. Stock must change only through opening stock, a sale, stock-in, sale reversal, or physical-count correction.

### 4.8 Daily Report (`/reports/daily`)

The date picker defaults to today. Show:

- Sales date
- Total recorded sales for that date, excluding voided batches
- Posted batch count
- Product breakdown: product, quantity sold, unit, applied unit price, total amount
- Voided batches and reasons in a separate section (informational, not included in sales total)
- Optional notes saved on each batch
- Print-friendly layout using a **Print Report** button and browser print styles

Date range reports may be added with the same rules, but the required report is at least one selectable day's summary. PDF export is not required for MVP; browser printing to PDF is acceptable.

### 4.9 Stock Movement History (`/inventory/movements` or product detail)

Provide an audit table with date/time, product, movement type, quantity change, stock before, stock after, reason/reference, and related sale entry where applicable. Filters for date range, product, and movement type are recommended.

---

## 5. Visual design requirements

- Use Next.js App Router and TypeScript throughout.
- Use Tailwind CSS for consistent layout and styling. A small, established component library such as shadcn/ui may be used if it speeds up implementation, but do not introduce an oversized design system.
- Prioritize readability: obvious page headings, one primary action per screen, labels beside inputs, visible validation messages, clear empty/loading/error states.
- Use a compact desktop sidebar/navigation with links to Dashboard, Inventory, Record Daily Sales, Sales History, Daily Report, and Stock Movements.
- On mobile, collapse the sidebar into a simple menu.
- Avoid unnecessary animations, decorative charts, and overly complex dashboards.
- Use PHP currency formatting with two decimals, e.g. `₱1,050.00`.
- Use quantity formatting that removes unnecessary trailing zeros for discrete units but supports fractional units if needed; always show the unit (`3 bottles`, `2 pieces`, `1.5 liters`).
- Format dates for the store's `Asia/Manila` timezone and label the selected business date clearly.
- Use accessible contrast, keyboard-accessible controls, visible focus states, and confirmation dialogs for voiding or stock correction.
- For tables on small screens, use horizontal scrolling or responsive cards instead of squeezing every column until unreadable.

---

## 6. Recommended technical architecture

### Runtime layout

```text
Browser (Next.js UI)
        |
        | HTTPS/local HTTP requests to app API
        v
Next.js App Router (Node.js runtime)
  - Pages and UI components
  - Route Handlers under /app/api/**
  - Validation schemas
  - Business services
  - mysql2/promise connection pool
        |
        | MySQL protocol over localhost TCP (default port 3306)
        v
XAMPP database service (MariaDB in many/current XAMPP packages)
  - hardware_inventory database
  - products/categories/users
  - sale batches and line snapshots
  - stock movement ledger
```

### Architectural rules

1. The browser must **never** connect directly to MySQL.
2. Never put database credentials, authentication secrets, or private configuration in `NEXT_PUBLIC_*` variables.
3. Use Next.js **App Router Route Handlers** (`app/api/.../route.ts`) for JSON API endpoints. Do not mix Pages Router API routes and App Router route handlers in the same feature.
4. Force database-related routes to the Node.js runtime, not Edge runtime, because `mysql2` needs a Node-compatible TCP connection.
5. Keep route handlers thin: parse the request, validate it, call a service, and return a typed response.
6. Put all stock-changing logic in server-side service functions. A React component must never directly update stock or make trusted financial calculations.
7. Use `mysql2/promise` with a shared connection pool. Do not create a new database connection for every query and do not open one pool per request.
8. Use prepared statements / parameterized queries. Do not build SQL by concatenating user-provided strings.
9. Use InnoDB tables, foreign keys, and SQL transactions for a sale, sale void, stock-in, and physical-count update.
10. Store historical product names, units, and selling prices on sale lines. A later catalog edit must not rewrite history.
11. Use decimal SQL types for prices and quantities. Do not use JavaScript floating-point calculations as the authoritative saved total; use integer cents or decimal-safe calculations, then store the result in `DECIMAL` columns. If normalizing values to two decimal places, use a clear rounding rule consistently.
12. Prefer server-side pagination and filtering for history views, even if the first store has only a small number of records.

### Suggested dependencies

Install only what the build needs. Recommended starting set:

- `next`, `react`, `react-dom`, `typescript`
- `mysql2`
- `zod` for request validation
- `bcryptjs` (or another maintained bcrypt implementation) for password hashes
- `jose` or a small established session library for signed session cookies
- `tailwindcss` and the packages required by the current stable Tailwind/Next.js setup
- Optional UI/form tools: `react-hook-form`, `@hookform/resolvers`, a lightweight toast library, and `lucide-react`

Use the current stable compatible versions at setup time and commit the lockfile. Do not install multiple libraries that solve the same problem.

---

## 7. Suggested project structure

```text
hardware-store-inventory/
├── database/
│   ├── schema.sql
│   └── README.md                  # Local database setup and backup notes
├── scripts/
│   └── seed-owner.ts              # Creates the first owner; no public signup
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx          # App navigation and protected layout
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── inventory/page.tsx
│   │   │   ├── inventory/new/page.tsx
│   │   │   ├── inventory/[id]/edit/page.tsx
│   │   │   ├── inventory/movements/page.tsx
│   │   │   ├── sales/page.tsx
│   │   │   ├── sales/new/page.tsx
│   │   │   ├── sales/[id]/page.tsx
│   │   │   └── reports/daily/page.tsx
│   │   └── api/
│   │       ├── auth/login/route.ts
│   │       ├── auth/logout/route.ts
│   │       ├── dashboard/route.ts
│   │       ├── categories/route.ts
│   │       ├── products/route.ts
│   │       ├── products/[id]/route.ts
│   │       ├── sales/route.ts
│   │       ├── sales/[id]/route.ts
│   │       ├── sales/[id]/void/route.ts
│   │       ├── stock-movements/route.ts
│   │       └── reports/daily/route.ts
│   ├── components/
│   │   ├── app-sidebar.tsx
│   │   ├── page-header.tsx
│   │   ├── stat-card.tsx
│   │   ├── product-form.tsx
│   │   ├── sales-entry-table.tsx
│   │   ├── confirm-dialog.tsx
│   │   └── empty-state.tsx
│   ├── lib/
│   │   ├── db.ts                  # Shared mysql2 pool
│   │   ├── auth.ts                # Login/session checks
│   │   ├── money.ts               # Currency/decimal helpers
│   │   ├── dates.ts               # Asia/Manila business dates
│   │   ├── api-response.ts
│   │   └── validation/
│   │       ├── product.ts
│   │       ├── sales.ts
│   │       └── stock.ts
│   ├── services/
│   │   ├── product-service.ts
│   │   ├── sales-service.ts
│   │   ├── stock-service.ts
│   │   └── report-service.ts
│   └── types/
│       └── index.ts
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

The agent may adapt the exact folder structure, but must keep database access, validation, and stock-changing business logic out of UI components.

---

## 8. Database design

Database name: `hardware_inventory`  
Character set: `utf8mb4`  
Storage engine: `InnoDB`  
Money type: `DECIMAL(12,2)` or wider where needed  
Quantity type: `DECIMAL(12,3)` to support both whole items and fractional units

### 8.1 `users`

Purpose: Store the owner login and who performed an action.

Fields:

- `id` — unsigned auto-increment primary key
- `username` — unique, required
- `password_hash` — required; never a plain-text password
- `display_name` — required
- `is_active` — boolean, default true
- `created_at`, `updated_at`

MVP uses one owner. No public registration. All write operations must have an authenticated user ID for audit fields.

### 8.2 `categories`

Fields:

- `id` — primary key
- `name` — required, unique
- `is_active` — boolean
- `created_at`, `updated_at`

Seed useful starting categories: `Engine Oil & Fluids`, `Tires`, `Mags & Wheels`, `Hardware`, and `Other`. These are editable suggestions, not a hard-coded product taxonomy.

### 8.3 `products`

Fields:

- `id` — primary key
- `sku` — optional unique product code; empty string should be normalized to `NULL`
- `name` — required
- `category_id` — required foreign key to `categories`
- `brand` — optional
- `variant` — optional product specification
- `unit` — required unit label, e.g. `bottle`, `piece`, `pair`, `set`, `box`, `pack`, `liter`
- `selling_price` — `DECIMAL(12,2)`, non-negative
- `stock_on_hand` — `DECIMAL(12,3)`, non-negative
- `reorder_level` — `DECIMAL(12,3)`, non-negative
- `is_active` — boolean, default true
- `created_at`, `updated_at`

Indexes: unique SKU, category ID, active flag, product name. If case-insensitive product search is needed, use a suitable collation or normalized search strategy.

### 8.4 `sale_batches`

Purpose: One saved end-of-day sales entry, potentially containing many product lines.

Fields:

- `id` — primary key
- `sale_date` — business date the sales occurred, `DATE`
- `notes` — nullable text
- `status` — `posted` or `voided`, default `posted`
- `total_amount` — saved total for the batch, `DECIMAL(14,2)`
- `created_by` — foreign key to `users`
- `created_at` — when this entry was saved
- `voided_by` — nullable foreign key to `users`
- `voided_at` — nullable datetime
- `void_reason` — nullable text, required when voiding
- `request_id` — optional unique client-generated idempotency key to prevent duplicate saves on retries

Indexes: `sale_date`, `(status, sale_date)`, and `created_at`.

### 8.5 `sale_items`

Purpose: Preserve the exact product and price used when the entry was posted.

Fields:

- `id` — primary key
- `sale_batch_id` — foreign key to `sale_batches`
- `product_id` — foreign key to `products`
- `product_name_snapshot` — product name at posting time
- `sku_snapshot` — nullable product code at posting time
- `unit_snapshot` — unit at posting time
- `quantity` — positive `DECIMAL(12,3)`
- `unit_price` — applied selling price at posting time, `DECIMAL(12,2)`
- `line_total` — quantity × price, rounded consistently to two decimals

Recommended indexes: `sale_batch_id`, `product_id`, and a composite join/report index for batch/date reporting where useful.

### 8.6 `stock_movements`

Purpose: The permanent stock ledger. Every stock change must produce one movement record in the same SQL transaction as the corresponding stock update.

Fields:

- `id` — primary key
- `product_id` — foreign key to `products`
- `movement_type` — one of `opening`, `sale`, `stock_in`, `sale_void_reversal`, `physical_count_correction`
- `quantity_delta` — signed `DECIMAL(12,3)`; positive adds stock, negative removes stock
- `stock_before` — `DECIMAL(12,3)`
- `stock_after` — `DECIMAL(12,3)`
- `reference_type` — nullable short text, e.g. `sale_batch`
- `reference_id` — nullable ID of the related record; this polymorphic reference need not have a foreign key
- `note` — optional reason/details
- `created_by` — foreign key to `users`
- `created_at` — database timestamp

Indexes: `(product_id, created_at)`, `(movement_type, created_at)`, `(reference_type, reference_id)`.

### 8.7 Relationships and invariants

- One category has many products.
- One sale batch has many sale items.
- One product can appear in many sale items and stock movements.
- One posted sale line must correspond to one negative `sale` stock movement.
- One voided sale line must have a matching positive `sale_void_reversal` movement.
- Product stock must equal its previous stock plus the signed movement from each stock-changing operation. Since current stock is stored for quick display, code must update `products.stock_on_hand` and insert the matching movement atomically.
- A sale batch total must equal the sum of its `sale_items.line_total` values.
- Voided batches remain in the database but are excluded from sales totals and normal sales-by-product figures.
- Do not cascade-delete sale batches, sale lines, or stock movements when a product is deactivated.

---

## 9. Initial SQL schema

The agent should place the finalized DDL in `database/schema.sql`. The following is an implementation baseline and can be adjusted for the selected MariaDB version while preserving these relationships and rules.

```sql
CREATE DATABASE IF NOT EXISTS hardware_inventory
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hardware_inventory;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(80) NULL,
  name VARCHAR(180) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  brand VARCHAR(120) NULL,
  variant VARCHAR(180) NULL,
  unit VARCHAR(40) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  reorder_level DECIMAL(12,3) NOT NULL DEFAULT 5.000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),
  KEY idx_products_active_name (is_active, name),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_products_price CHECK (selling_price >= 0),
  CONSTRAINT chk_products_stock CHECK (stock_on_hand >= 0),
  CONSTRAINT chk_products_reorder CHECK (reorder_level >= 0)
) ENGINE=InnoDB;

CREATE TABLE sale_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_date DATE NOT NULL,
  notes TEXT NULL,
  status ENUM('posted','voided') NOT NULL DEFAULT 'posted',
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_by BIGINT UNSIGNED NULL,
  voided_at DATETIME NULL,
  void_reason TEXT NULL,
  request_id CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sale_batches_request_id (request_id),
  KEY idx_sale_batches_date (sale_date),
  KEY idx_sale_batches_status_date (status, sale_date),
  KEY idx_sale_batches_created_at (created_at),
  CONSTRAINT fk_sale_batches_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sale_batches_voided_by FOREIGN KEY (voided_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_sale_batches_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE sale_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_batch_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name_snapshot VARCHAR(180) NOT NULL,
  sku_snapshot VARCHAR(80) NULL,
  unit_snapshot VARCHAR(40) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sale_items_batch (sale_batch_id),
  KEY idx_sale_items_product (product_id),
  CONSTRAINT fk_sale_items_batch FOREIGN KEY (sale_batch_id)
    REFERENCES sale_batches(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_sale_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_sale_items_price CHECK (unit_price >= 0),
  CONSTRAINT chk_sale_items_total CHECK (line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM(
    'opening',
    'sale',
    'stock_in',
    'sale_void_reversal',
    'physical_count_correction'
  ) NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  stock_before DECIMAL(12,3) NOT NULL,
  stock_after DECIMAL(12,3) NOT NULL,
  reference_type VARCHAR(40) NULL,
  reference_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_movements_product_date (product_id, created_at),
  KEY idx_stock_movements_type_date (movement_type, created_at),
  KEY idx_stock_movements_reference (reference_type, reference_id),
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (created_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_stock_movement_after CHECK (stock_after >= 0)
) ENGINE=InnoDB;

INSERT INTO categories (name) VALUES
  ('Engine Oil & Fluids'),
  ('Tires'),
  ('Mags & Wheels'),
  ('Hardware'),
  ('Other');
```

**Implementation note:** Older MariaDB releases may parse or enforce `CHECK` constraints differently. Keep equivalent checks in server-side validation regardless of database support. Test the schema against the version bundled with the owner's installed XAMPP.

---

## 10. Environment and local XAMPP setup

### `.env.example`

```dotenv
# Never commit real credentials. Duplicate this as .env.local.
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=hardware_inventory
DB_USER=inventory_app
DB_PASSWORD=replace_with_a_local_database_password

APP_TIME_ZONE=Asia/Manila
AUTH_SECRET=replace_with_a_long_random_secret_at_least_32_bytes
```

Do not prefix database credentials or the session secret with `NEXT_PUBLIC_`.

### Local setup expected in the README

1. Install Node.js LTS and a current XAMPP release.
2. Open XAMPP Control Panel and start the database service (shown as **MySQL** in the control panel, commonly backed by MariaDB in XAMPP packages).
3. Open phpMyAdmin at `http://localhost/phpmyadmin`.
4. Create/import `database/schema.sql`.
5. Create a dedicated local database user such as `inventory_app` for `hardware_inventory`. Prefer a password and only grant the permissions the app requires. Do not expose the database port to the public internet.
6. Copy `.env.example` to `.env.local` and set local values.
7. Run `npm install`.
8. Run the owner-seed command documented by the app to create the first username/password. Do not ship a known default password.
9. Run `npm run dev` and open `http://localhost:3000`.
10. Check the database connection and show a clear, non-sensitive error if the database service is stopped.

### Local-only and network access warning

A Next.js app running on the owner's laptop can connect to XAMPP through `127.0.0.1`. Other devices cannot use `127.0.0.1` to reach the owner's laptop; on a local network, the app and database must be deliberately configured for LAN access. If LAN usage is needed, expose the Next.js app on the local network and restrict database access to the app host/firewall. Do not expose XAMPP/phpMyAdmin or port `3306` directly to the internet.

XAMPP is suitable here as a local development/small local deployment environment, not as a turnkey secure public production host. If the owner later needs access from outside the store, design a proper hosted database/deployment setup rather than simply opening the database port.

---

## 11. Database pool and server access

Create one shared pool in `src/lib/db.ts` using `mysql2/promise`.

Expected settings:

- Host, port, username, password, and database from server-only environment variables.
- A small connection limit appropriate for one store.
- `waitForConnections: true` and a reasonable `queueLimit`.
- `decimalNumbers` should be chosen deliberately; avoid silently converting high-precision DECIMAL values to imprecise JavaScript numbers for financial calculations.
- Use `connection.release()` in a `finally` block after a checked-out connection is used.
- In development, avoid creating a new pool on every hot reload; cache the pool on a safe server-side global or use an equivalent stable pattern.
- Use separate pooled connections for ordinary reads. Use one checked-out connection for all statements inside a transaction.

The following is a conceptual baseline, not a complete production implementation:

```ts
import mysql from 'mysql2/promise';

const globalForDb = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
};

export const pool = globalForDb.mysqlPool ?? mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

if (process.env.NODE_ENV !== 'production') {
  globalForDb.mysqlPool = pool;
}
```

Adapt imports/types to the installed mysql2 version and keep decimal parsing explicit. Never return database errors, SQL statements, passwords, or environment values to the browser.

---

## 12. API contract

All JSON responses should use a consistent structure, for example:

```json
{
  "success": true,
  "data": {},
  "message": "Saved successfully"
}
```

For failures:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock for Engine Oil 1L.",
    "details": {
      "available": 2,
      "requested": 3,
      "unit": "bottle"
    }
  }
}
```

Do not expose SQL details or stack traces in API responses. Use suitable HTTP status codes (400 validation error, 401 unauthenticated, 404 not found, 409 conflict/insufficient stock/idempotency conflict, 500 unexpected server error).

### Required endpoints

| Method and path | Purpose | Rules |
|---|---|---|
| `POST /api/auth/login` | Log in | Validate input; verify hash; set HttpOnly session cookie |
| `POST /api/auth/logout` | Log out | Clear session cookie |
| `GET /api/dashboard?date=YYYY-MM-DD` | Dashboard data | Return selected-date totals, low/out-of-stock counts, active product count, product sales and recent batches |
| `GET /api/categories` | List active categories | Sorted by name |
| `POST /api/categories` | Create category | Reject blank and duplicate names |
| `GET /api/products` | List/search products | Support `q`, `categoryId`, `stockStatus`, `active`, `page`, and `pageSize` filters |
| `POST /api/products` | Create product | Validate catalog fields; record opening movement in the same transaction |
| `GET /api/products/:id` | Product detail | Return product and useful stock summary |
| `PATCH /api/products/:id` | Edit catalog info | Do not directly alter stock through this endpoint |
| `POST /api/products/:id/deactivate` | Deactivate product | Keep history intact |
| `POST /api/sales` | Post daily sales batch | Validate every line, lock/check stock, calculate totals, deduct stock, insert lines and movements atomically |
| `GET /api/sales` | Search sales history | Filter by date range and status; paginate |
| `GET /api/sales/:id` | Sales batch details | Return immutable line snapshots and void state |
| `POST /api/sales/:id/void` | Void a posted batch | Require reason; restore inventory once; preserve the original record |
| `POST /api/stock-movements/stock-in` | Receive more stock | Positive quantity; transactional update and movement entry |
| `POST /api/stock-movements/physical-count` | Correct to physical count | Lock product; compute delta; reject negative actual count; save movement |
| `GET /api/stock-movements` | Review movement ledger | Filter by product/type/date and paginate |
| `GET /api/reports/daily?date=YYYY-MM-DD` | Daily sales report | Exclude voided batches and group quantities by product/unit |

Use `export const runtime = 'nodejs'` in database-connected Route Handlers.

### Example `POST /api/sales` request

```json
{
  "saleDate": "2026-10-16",
  "notes": "End-of-day notebook entry",
  "requestId": "a6e7f0d2-62c3-4b47-a9f6-ef8a417c3d11",
  "items": [
    {
      "productId": 12,
      "quantity": "3",
      "unitPrice": "350.00"
    },
    {
      "productId": 28,
      "quantity": "2",
      "unitPrice": "4200.00"
    }
  ]
}
```

The browser can send the displayed price, but the server must validate it. When `unitPrice` is omitted, the server uses the product's current `selling_price`. The server calculates each `line_total` and the batch total. It must not trust a client-submitted total.

### Example successful response

```json
{
  "success": true,
  "data": {
    "saleBatchId": 104,
    "saleDate": "2026-10-16",
    "status": "posted",
    "totalAmount": "9450.00",
    "items": [
      {
        "productId": 12,
        "productName": "Engine Oil 1L",
        "quantity": "3.000",
        "unit": "bottle",
        "unitPrice": "350.00",
        "lineTotal": "1050.00",
        "stockBefore": "20.000",
        "stockAfter": "17.000"
      }
    ]
  }
}
```

The response values can be shaped to the final frontend types, but keep the same business information and preserve decimal values safely.

---

## 13. Critical business logic: posting a sales batch

Implement this in one reusable service function, for example `postSalesBatch()` in `src/services/sales-service.ts`.

### Input checks before the transaction

- The user is authenticated and active.
- `saleDate` is a valid `YYYY-MM-DD` date. Reject malformed dates rather than silently guessing.
- There is at least one line.
- Every product ID is a valid positive integer.
- Every quantity is a valid positive decimal with no more than three decimal places.
- Each product appears only once in a batch.
- Any provided price is a valid non-negative amount with at most two decimal places.
- Notes fit the defined limit.
- The request ID, if provided, is a valid UUID.

### Transaction sequence

Use a single checked-out database connection:

1. `beginTransaction()`.
2. If an idempotency `requestId` exists, check whether it has already been used. If the same completed request exists, return its result rather than deducting stock again.
3. Load the requested active products using row locks (`SELECT ... FOR UPDATE`) in a consistent order (e.g. ascending product ID) to reduce deadlocks.
4. Verify every requested product exists and is active.
5. Verify each requested quantity is no greater than that product's current `stock_on_hand`. If any line fails, throw a typed `INSUFFICIENT_STOCK` error and roll back the entire batch.
6. Determine the applied unit price for each line: use a valid owner-supplied override if supported, otherwise use the catalog selling price. Do not accept negative prices.
7. Calculate each line total using a consistent currency rounding rule and calculate the batch total server-side.
8. Insert one `sale_batches` row with `status='posted'`, the sale date, total, notes, user ID, and request ID.
9. For every line, insert a `sale_items` row with product name/SKU/unit/price snapshots.
10. For every line, update `products.stock_on_hand = stock_on_hand - quantity` and insert a `stock_movements` row:
    - `movement_type='sale'`
    - `quantity_delta=-quantity`
    - accurate `stock_before` and `stock_after`
    - `reference_type='sale_batch'`, `reference_id=<new batch id>`
    - `created_by=<current user>`
11. Commit the transaction.
12. Return the newly stored batch with lines and new stock balances.
13. In a `catch` path, roll back if the transaction is still open; in `finally`, release the connection.

### Important transaction details

- The stock read/check and stock decrement must be protected against another request selling the same stock at the same time. Use InnoDB transactions and row locks.
- If a product has 2 bottles but the batch asks for 3, **none** of the batch should be saved.
- Do not decrement stock in the browser or in a separate background request after saving a sale.
- Do not commit the sale batch before its lines and stock movements are inserted.
- Do not create a batch with no lines.
- Do not let reloading the success page submit the same batch again.
- If the transaction fails, return a helpful error and leave stock and reports unchanged.

### Amount precision

Prices are stored to two decimal places. Quantities can have up to three decimals. A consistent policy is to compute `line_total = round(quantity × unit_price, 2)` per line, then set batch total to the sum of the saved line totals. Use a decimal-safe implementation or integer-minor-unit strategy as appropriate. Do not calculate one total in the UI and a different total in SQL.

---

## 14. Critical business logic: voiding a sales batch

Create a service function such as `voidSalesBatch()`.

1. Require an authenticated owner and a non-empty reason.
2. Begin a transaction.
3. Load and lock the `sale_batches` row.
4. If the batch does not exist, return `404`.
5. If it is already voided, return a conflict/validation error without changing stock.
6. Load sale lines and lock all associated products in a consistent order.
7. For each line, add the quantity back to the current stock and insert a `sale_void_reversal` movement with a positive quantity delta, the correct before/after values, and reference to the batch.
8. Set the batch status to `voided`; record `voided_by`, `voided_at`, and `void_reason`.
9. Commit.

Daily reports must filter on `sale_batches.status='posted'`. Keep the original sale rows so there is an audit history. Do not delete the original stock-movement rows; reversal rows explain the correction.

---

## 15. Critical business logic: stock-in and physical counts

### Stock-in service

1. Validate product, positive quantity, and optional note.
2. Begin transaction and lock the product row.
3. Calculate `before` and `after = before + quantity`.
4. Update product `stock_on_hand` to `after`.
5. Insert a `stock_in` movement with positive `quantity_delta`, `stock_before`, and `stock_after`.
6. Commit; return the new stock.

### Physical-count correction service

1. Validate product, physical count `>= 0`, and a required reason.
2. Begin transaction and lock the product row.
3. Set `before = current stock`; set `after = submitted physical count`; compute `delta = after - before` on the server.
4. Update `products.stock_on_hand` to `after`.
5. Insert a `physical_count_correction` movement using that delta and before/after quantities.
6. Commit.

Never trust a client-supplied `stock_before`, `stock_after`, or delta. Those values are derived on the server.

---

## 16. Reporting logic and SQL expectations

### Current stock

Read `products.stock_on_hand`. This column is maintained transactionally and is the fast source for the current inventory screen. Movement history is the audit explanation for changes.

### Today's sales total

Sum only posted batches for a business date:

```sql
SELECT COALESCE(SUM(total_amount), 0.00) AS total_sales,
       COUNT(*) AS posted_batches
FROM sale_batches
WHERE sale_date = ?
  AND status = 'posted';
```

Pass a validated date from the API. Do not concatenate it into SQL.

### Sales by product for a date

Join posted batches to sale items, group by product snapshot and unit snapshot, and sum quantity and line total. For reports that should distinguish a renamed product or changed unit, group by the historical snapshots, not just the current product name.

### Low stock

`is_active = 1 AND stock_on_hand > 0 AND stock_on_hand <= reorder_level`.

### Out of stock

`is_active = 1 AND stock_on_hand = 0`.

### Inventory list status

- `Out of stock`: stock equals zero.
- `Low stock`: stock is above zero and less than or equal to reorder level.
- `In stock`: stock is above reorder level.

If the reorder level is zero, a positive quantity is `In stock`; zero remains `Out of stock`.

### Important reporting guardrails

- Always exclude voided sales from revenue and product sales totals.
- Never recalculate historic line revenue from the current product selling price.
- Filter by `sale_date` for sales reporting, not by `created_at`. `created_at` describes when someone entered the record; `sale_date` describes which business day the report belongs to.
- Show the entry timestamp separately when useful, especially when the owner enters the previous day's totals in the morning.
- Sum saved `line_total` values to ensure totals reconcile with the sale batch.

---

## 17. Authentication and security

The system may be local, but must still use sensible controls.

- Use a single owner login for the MVP. No public registration and no hard-coded default credentials.
- Hash passwords with bcrypt before saving them.
- Use an `HttpOnly`, `SameSite=Lax` cookie and `Secure` in HTTPS deployments. Keep the signing secret on the server.
- Check the session in protected page layouts and **again inside every write API route**. Hiding a button is not authorization.
- Clear the cookie on logout and reject inactive users.
- Set reasonable login error responses; do not reveal whether a username exists.
- Validate every request body with Zod or equivalent server-side validation.
- Use parameterized SQL; never build filters by directly concatenating user input.
- Escape/render user-controlled product names and notes safely.
- Do not expose passwords, `AUTH_SECRET`, SQL errors, connection strings, or stack traces in API responses or logs visible to end users.
- Add basic login throttling if practical.
- Require a confirmation and reason before voiding sales or changing physical counts.
- Use audit fields on every write.
- Provide database backup instructions. XAMPP's database folder alone should not be treated as a reliable backup strategy; export the database regularly through phpMyAdmin or a documented dump script.
- Do not expose phpMyAdmin or port 3306 to the public internet.

---

## 18. Validation, errors, and usability details

### Product validation

- Trim required names and category names.
- Product name: 1–180 characters.
- SKU: optional; unique when provided; normalize blank to `NULL`.
- Unit: 1–40 characters.
- Selling price: decimal, non-negative, at most two decimal places.
- Opening stock and reorder level: non-negative, at most three decimal places.
- Category must exist and be active.
- Prevent accidental product deactivation if the UI has an unsaved form.

### Sales validation

- Require at least one item.
- Reject an inactive/missing product.
- Reject a duplicate product in the same request.
- Reject quantity <= 0 or more than three fractional digits.
- Reject negative or malformed prices.
- Prevent stock from going below zero.
- On an error, keep the entered form values so the owner doesn't need to start again.

### UI states

Every data screen should have:

- Loading state
- Empty state
- Error state with a retry action where sensible
- Success feedback after save
- Disabled save button while a request is pending
- Clear inline field validation
- A confirmation step for destructive/corrective actions

If XAMPP is stopped, show a plain message such as `Cannot connect to the local database. Open XAMPP Control Panel and start MySQL, then retry.` Do not show raw driver or SQL errors.

---

## 19. Performance and reliability requirements

The dataset is expected to be small, so optimize for reliability and responsiveness rather than complex infrastructure.

- Dashboard and inventory should normally load in about 1 second on the local machine with a modest catalog.
- Add indexes for all common filters and foreign keys.
- Paginate sales history and stock movements.
- Fetch only fields used by the current screen.
- Avoid one database query per product row (N+1 queries); use joins or a small number of batched queries.
- Use one transaction for all stock-related state changes.
- Do not use a global mutable cached stock value in the Node.js process.
- Refresh affected dashboard/inventory queries after a successful mutation. Do not rely on a stale browser cache for current stock.
- If using client-side caching (e.g. SWR or TanStack Query), invalidate the product stock, dashboard, sales history, and daily report queries after a sale or reversal.
- Add database connection health handling and a useful startup/setup check.
- Keep logs concise and never log secrets.

---

## 20. Test plan and acceptance criteria

The agent must test the business rules, not only whether screens render.

### Product setup

- [ ] Owner can create a category.
- [ ] Owner can add `Engine Oil 1L` with starting stock `20`, unit `bottle`, selling price `350.00`, reorder level `5`.
- [ ] Stock starts at 20 and an `opening` stock movement exists.
- [ ] Product edits do not alter stock or past sale history.
- [ ] Duplicate non-empty SKU is rejected.
- [ ] A product with history can be deactivated but not hard-deleted.

### Daily sales

- [ ] Owner can select a business date and add several different products in one batch.
- [ ] Entering quantity 3 for Engine Oil 1L at ₱350 saves a line total of ₱1,050.00.
- [ ] Stock changes from 20 to 17 after a successful save.
- [ ] The saved sale batch total equals the sum of its saved line totals.
- [ ] The current dashboard total updates after saving.
- [ ] The sale's applied price stays the same after the catalog price is changed later.
- [ ] A product cannot be added twice to one batch without a deliberate combine action.
- [ ] Empty batches and zero/negative quantities are rejected.
- [ ] If stock is 2 and quantity requested is 3, the request fails and no line, batch, or movement is saved.
- [ ] If one line in a multi-product batch is invalid, no stock is deducted for any line.
- [ ] Repeating the same `requestId` does not deduct stock twice.
- [ ] A warning appears if the chosen date already has a posted entry.
- [ ] The user can enter a previous sale date, and reports use that date while stock is deducted at save time.

### Stock operations

- [ ] Stock-in adds the submitted quantity and creates a positive stock movement.
- [ ] Physical-count correction can increase stock, reduce stock, or set stock to zero.
- [ ] Negative physical count is rejected.
- [ ] The movement row stores the correct before, delta, and after values.
- [ ] The UI cannot alter stock using the regular product edit endpoint.

### Voiding and audit

- [ ] Voiding a posted batch requires a reason and restores each sold quantity exactly once.
- [ ] The batch becomes `voided`, and the void metadata is saved.
- [ ] Voided batches no longer contribute to daily sales totals.
- [ ] A second void request makes no stock changes.
- [ ] Original sale lines and stock movements remain available for audit.

### Daily reports

- [ ] A selected date shows only that date's posted sales.
- [ ] Multiple batches for the date are summed correctly.
- [ ] Voided batches are excluded from sales revenue.
- [ ] Per-product quantities show the proper unit.
- [ ] A price edit does not change historic revenue.
- [ ] Print view is readable and hides navigation and action buttons.

### Security and setup

- [ ] Unauthenticated users cannot access protected pages or write APIs.
- [ ] Logging out invalidates the browser session.
- [ ] Password is stored as a hash.
- [ ] `.env.local` is ignored by Git and no secrets appear in client bundles.
- [ ] All dynamic SQL values are parameterized.
- [ ] Stopping XAMPP yields a friendly database-connection message.
- [ ] Fresh installation steps work from a clean checkout.

---

## 21. Implementation order for the coding agent

Build in this sequence to reduce regressions.

### Phase 1 — project and database foundation

1. Inspect the current repository before changing anything.
2. Scaffold/configure Next.js App Router + TypeScript + Tailwind using compatible stable releases.
3. Add `.env.example`, `.gitignore`, DB pool, validation helpers, types, and consistent API error responses.
4. Create `database/schema.sql` and local setup documentation.
5. Implement the owner seed script and login/logout flow.
6. Verify connection to XAMPP and verify types/lint/build.

### Phase 2 — inventory

1. Implement category list/create.
2. Implement product create/list/detail/update/deactivate.
3. Implement opening stock ledger entries.
4. Implement stock-in and physical-count correction services.
5. Build the Inventory screen, product form, search, filters, and stock-status display.
6. Verify all stock changes have movement history.

### Phase 3 — daily sales core

1. Define and test `postSalesBatch()` before building the UI.
2. Add transaction handling, row locks, server pricing, stock checks, snapshots, movement entries, and idempotency.
3. Implement `POST /api/sales`, sales history, and sale detail.
4. Build the Record Daily Sales screen with multi-product input and live UI calculations.
5. Confirm successful saves refresh inventory and dashboard.
6. Implement the void service and void dialog with required reason.

### Phase 4 — dashboard and reports

1. Implement dashboard aggregates and low/out-of-stock counts.
2. Implement daily product breakdown and sales history filters.
3. Implement stock movement history.
4. Add print-friendly daily report.

### Phase 5 — quality pass

1. Execute every acceptance criterion above.
2. Test multi-line transaction rollback and repeated submissions.
3. Test with a realistic catalog of at least 100 products and a large-enough sales history to expose pagination issues.
4. Test mobile width and keyboard-only use of the sales form.
5. Check `npm run lint`, `npm run typecheck` (if configured), and `npm run build`.
6. Fix failures before adding optional features.
7. Update README with exact Windows/XAMPP steps, environment variables, seed command, run command, database backup/restore steps, and troubleshooting.

---

## 22. Required agent deliverables

The coding agent should finish with:

1. A working Next.js + TypeScript application.
2. SQL schema file and category seed data.
3. Secure owner-account setup/seed command.
4. Product catalog and stock operations.
5. Daily sales entry that automatically updates inventory transactionally.
6. Dashboard and daily sales report.
7. Sales history, sale detail, and void/reversal workflow.
8. Stock movement audit history.
9. Responsive UI with loading, empty, error, and success states.
10. `.env.example` with placeholders only.
11. Complete setup instructions for Windows + XAMPP/phpMyAdmin.
12. Tests or a written test run showing the acceptance criteria passed.

The agent must not claim a feature is complete unless it has been implemented and checked. If a requirement cannot be completed, clearly list what remains and why.

---

## 23. Definition of done

The MVP is complete when the owner can add products and starting stock, then enter the day's quantities sold in one simple form; the app calculates the daily revenue using the saved prices, rejects sales that would make stock negative, deducts stock immediately on save, retains a history of every stock movement, and presents a readable daily sales report. All of this must work on the local Windows machine connected to XAMPP without requiring a cloud database.

## Documentation references

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js environment variables: https://nextjs.org/docs/app/guides/environment-variables
- mysql2 documentation: https://sidorares.github.io/node-mysql2/docs/documentation
- mysql2 prepared statements: https://sidorares.github.io/node-mysql2/docs/examples/queries/prepared-statements
- XAMPP for Windows FAQ (including its MariaDB note and local-development security guidance): https://www.apachefriends.org/faq_windows

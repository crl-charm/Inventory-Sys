# Decisions log

Where the spec was silent or the two spec files in the repo conflicted, the
simplest option consistent with the requirements was chosen. Each entry lists
the decision, why, and what it affects.

Sources: `hardware_store_inventory_agent_spec.md` (authoritative, per owner)
and `hardware-inventory-spec.md` (alternative, not built from).

---

## D-01 — Build from the agent spec
When the two specs conflicted (Prisma vs mysql2; shadcn/TanStack/Recharts vs
plain Tailwind; STAFF role, cost price, CSV export, charts), the owner chose
`hardware_store_inventory_agent_spec.md`. Nothing from the other spec's extra
scope was built: no STAFF accounts, no cost price/profit, no CSV export, no
settings page, no charts.

## D-02 — Stack versions
Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5.9 (strict,
`noUncheckedIndexedAccess`), Tailwind CSS 4, `mysql2` 3.24, Zod 4, `jose` 6,
`bcryptjs` 3, `tsx` for scripts. ESLint is pinned to 9.x: the 10.x line makes
`eslint-config-next`'s plugin chain require `@babel/core`, which is dead
weight for this project.

## D-03 — Raw SQL, not an ORM
Per the agent spec: `database/schema.sql` + parameterized queries through
`mysql2`. No Prisma. Schema application is idempotent (`npm run db:init`);
versioned in-place migrations run with `npm run db:migrate` and are recorded
in the `schema_migrations` table (see D-17).

## D-04 — Money and quantities are decimal strings
`DECIMAL` columns are read with `decimalNumbers: false` and travel as strings
(“1050.00”, “3.000”). All arithmetic happens in `src/lib/money.ts` using
BigInt on scaled integers (centavos / thousandths), half-up rounding for line
totals. JS floats are never used for money. The server recomputes every
amount; client-sent totals don't exist.

## D-05 — Timezone handling
`DATETIME` is stored as UTC and read with `timezone: "Z"`. Business dates
(“today”, sale dates, report dates) use `APP_TIME_ZONE` (default
`Asia/Manila`, fixed +08:00, no DST). The movement-ledger date filters build
UTC boundaries in JS rather than calling `CONVERT_TZ`, because MariaDB's
timezone tables are often not loaded on XAMPP installs (CONVERT_TZ then
returns NULL and silently breaks filters). A defect here — `timezone: "Z"`
only governs how mysql2 *parses* values, not how the database *writes*
`DEFAULT CURRENT_TIMESTAMP` columns — was found and fixed in D-19 after the
owner noticed wrong "entered" times.

## D-06 — Auth session
Signature-verified JWT (HS256, `jose`) in an HttpOnly, SameSite=Lax cookie,
7-day expiry. Single owner account; no roles (agent spec has no STAFF role).
Login failures are throttled in memory (per username+IP, 8 attempts / 10 min).
`AUTH_SECRET` must be ≥ 32 chars.

## D-07 — CSRF
The SameSite=Lax cookie is the primary defense; mutating API requests
additionally require an `Origin` header matching the request origin
(`src/lib/api-response.ts` → `assertSameOrigin`).

## D-08 — Idempotent sales posting
The entry form generates a UUID `requestId` once per form session. A unique
index on `sale_batches.request_id` plus a pre-check make retries return the
original batch (`replayed: true`) with no second stock deduction. A new key
is generated only after a successful save.

## D-09 — Line merging and totals
Duplicate product lines are merged server-side; per-product stock deductions
sum all quantities, and the batch total is the sum of the **saved** line
totals (2-dp half-up). A batch may contain the same product twice only with
different unit-price overrides.

## D-10 — Inactive product sale → 409
Selling a deactivated product is rejected with `409 CONFLICT` (payload valid,
resource state forbids it), consistent with `INSUFFICIENT_STOCK`/`ALREADY_VOIDED`.

## D-11 — Zero-delta physical count → 409
A physical count that equals current stock is rejected (`409`) rather than
recording a no-op correction; it almost always means a mis-tap.

## D-12 — `react-hooks/set-state-in-effect` disabled
The new React Compiler lint rule flags the standard “fetch on mount / when
filters change, keep loading state locally” pattern used by the five list
views. The spec bans client data libraries (TanStack Query etc.), so the
pattern is intentional; the rule is turned off in `eslint.config.mjs` with a
comment.

## D-13 — Dates: no backdating limit, no future dates
Future sale dates are rejected (422). Backdating is unlimited — the spec has
no window limit, and the warning banner + current-stock semantics are shown
in the UI when a past date is selected.

## D-14 — Products and categories are never deleted
Deactivate only (`is_active`). History (sale snapshots, movements) must stay
readable. Category management is limited to creating categories inline from
the product form; no separate category admin screen was built.

## D-15 — Scope guardrails kept
No POS/receipts, barcode, suppliers/POs, customer credit, payroll, payments,
multi-branch, or offline/PWA features. End-of-day batch entry only.

## D-16 — Testing approach
No test framework was added. The spec's acceptance-criteria list is executed
as a runnable script against the live HTTP API + MariaDB:
`backend/scripts/acceptance.ps1` (auth, catalog, sales posting, base/final
pricing, idempotency, oversell rejection, stock ops, reports, void/audit,
deactivation). It drives the frontend proxy at `:3000`, so both services must
be running. It mutates data and is meant for dev machines.

## D-17 — Base Price / Final Price on sale lines
Per `daily_sales_base_final_price_agent_instructions_v2.md`: the Record Daily
Sales form shows a read-only **Base Price** (the catalog selling price from the
locked product row at entry time) and an editable **Final Price** (the amount
actually charged, defaulting to the Base Price). Line totals, batch totals and
every revenue figure use the Final Price. `sale_items` stores both as
snapshots (`base_unit_price`, `final_unit_price`) so later catalog edits never
rewrite history. Migration `0001_sale_items_base_final_price`
(`npm run db:migrate`) added the two columns, backfilled them from the legacy
`unit_price` (for historical rows the applied price was the catalog price, so
both snapshots get it), swapped the CHECK constraints, and then dropped
`unit_price` — safe because this app has no external API consumers. The API
still accepts a legacy `unitPrice` field when `finalUnitPrice` is absent
(`finalUnitPrice` always wins); this compatibility is internal only and can be
retired once no pre-change client remains. Only the Record Daily Sales screen
gained the new fields — other screens keep their layout and show the saved
Final Price in any existing single price column. No discount terminology is
used anywhere.

## D-18 — Backend/frontend split for deployment
The app is split so the two halves deploy independently (two Render Web
Services): `backend/` is a plain Node HTTP API (`tsx`, port 4000) that owns
the database, services, migrations, seed and the acceptance script;
`frontend/` is the Next.js UI (port 3000). The browser only talks to the
frontend origin — `/api/*` is proxied server-side
(`frontend/src/app/api/[...path]/route.ts`) and server-rendered pages fetch
through `frontend/src/lib/backend.ts` — so the session cookie stays
first-party. CSRF: mutations must carry an Origin matching `FRONTEND_ORIGIN`
(backend env) or the API origin. `FRONTEND_ORIGIN` accepts a
comma/space-separated list, so the store phone on the LAN
(e.g. `http://192.168.68.102:3000`) can sign in as well — unknown origins
are still rejected. The `server-only` imports were removed from
backend services (Next.js guards with no meaning in a standalone server).
Root `package.json` scripts delegate to the halves with `npm --prefix`.
Deploying to Render still needs an external MySQL host - Render offers
Postgres only, so `DB_*` must point at a reachable MySQL/MariaDB server.

## D-19 - DATETIME writes are pinned to UTC (wrong "entered" times fixed)
The owner reported that recorded sales showed the wrong time. Root cause:
`DEFAULT CURRENT_TIMESTAMP` columns (`created_at`, `updated_at`,
`applied_at`) were written in the database session's local time (SYSTEM =
UTC+08:00 on this machine) while mysql2's `timezone: "Z"` and the UI read
them as UTC and converted to `Asia/Manila` for display — so a sale recorded
at 11:53 PM showed as 7:53 AM the next day (+8h). The `timezone: "Z"` pool
option only affects parsing; it never touched the session timezone. Fix:
every connection pins `SET time_zone = '+00:00'` — the app pool in
`backend/src/lib/db.ts` (via the `connection` event) and the `db-init`,
`db-migrate`, `seed-owner` scripts — so DB time and app time agree in UTC
end to end (D-05). Already-stored rows are shifted by migration
`0002_datetimes_to_utc`: `DATE_SUB(col, INTERVAL 8 HOUR)` (fixed offset;
CONVERT_TZ avoided per D-05) on `users`, `categories`, `products`,
`sale_batches.created_at`, `stock_movements.created_at` and
`schema_migrations.applied_at`. `sale_batches.voided_at` is not shifted — it
was always written with explicit `UTC_TIMESTAMP()` and was already correct.
The migration records itself inside the same transaction as the data shift
and `db-migrate` now uses `INSERT IGNORE` for the record, so an interrupted
run can never double-shift. `npm run db:migrate` (once, on installs that
predate this entry; a no-op on fresh ones). The acceptance suite gained two
regression checks asserting `createdAt` / `voidedAt` are within 5 minutes of
UTC now — catching this class of bug automatically.

## D-20 - R Garage brand logo and installable PWA
The shop logo is `frontend/public/logo.svg` (master artwork also kept at
`Favicon/logo.svg`). `npm run icons` (frontend; exposed at the root too)
regenerates every icon from it with `@resvg/resvg-js` (dev-only dependency):
`favicon.svg` cropped to the tile, 192/512 `any` PNGs, a 512 opaque
`maskable` for Android launcher masks, and the 180 Apple touch icon.
Outputs are committed, so builds and deploys never run the generator.
`frontend/src/app/manifest.ts` serves the webmanifest (full name, short name
"R Garage", black theme `#0a0a0b`, `display: standalone`, `start_url: /`
which funnels into login/dashboard). `public/sw.js` is a deliberately
network-only service worker — it caches nothing, so the shop can never be
shown a stale screen or sales form (the same class as the stale-chunk bug);
it exists so Chrome offers the full "Install app" on HTTPS. Installability
needs a secure context: `localhost` on the PC and the future Render HTTPS
URL install fully; over the shop LAN (`http://<ip>:3000`) iPhone can still
"Add to Home Screen" (apple-touch icon + web-app metas) and Android only
creates a shortcut. The login screen, top bar, and sidebar all render this
logo via the `BrandMark` component.

## D-21 - LAN http is not a secure context (client crypto + error boundary)
Over the shop LAN (`http://192.168.68.102:3000`) every browser treats the
origin as insecure, so secure-context-only APIs simply do not exist there.
`crypto.randomUUID()` was called for the sales form's idempotency key
(`sales-entry-form.tsx`) and threw `TypeError` the moment the page hydrated
or finished a save - invisible from `localhost` (always a secure context),
fatal from the phone or the LAN IP. Client code now uses
`lib/request-id.ts` (`newRequestId()`): `crypto.randomUUID()` when available,
otherwise a hand-built RFC 4122 v4 id from `crypto.getRandomValues()` (not
restricted to secure contexts). Rule: no secure-context-only browser API in
client code paths that run on the LAN. `app/error.tsx` now provides a
branded root error boundary (Try again / Go to dashboard) so any future
uncaught page error replaces the framework's bare screen instead of showing
it to the shop.

## D-22 - One theme everywhere: near-black + brass across the whole app
The owner asked for the in-app screens to match the login screen. The light
working UI is gone: `body` is `--color-brand-ink` with a faint brass/white
ambient tint, `color-scheme: dark` (native date pickers, selects and
scrollbars render dark), and the shared utilities in `globals.css` define
the whole look in one place: `card` (white/3.5% on near-black, white/10
borders), `input` (dark, brass focus ring), `btn-primary`/`btn-gold` (brass
gradient, ink text), `btn-secondary` (dark outline), `btn-icon`, and
`--color-brand-panel` (#121215) for solid elevated surfaces (drawer, modals,
product picker). Active nav items and links use brass; status chips use
"color/10 background + color-300 text" so they stay legible on black.
Reports stay printable: inside `@media print` the `.print-area` subtree is
forced back to ink-on-paper, so the daily report still prints light.

## D-23 - Hardening, backups, and a small GET cache (optimization pass)
A ten-item pass requested by the owner (security, rendering, cache,
maintenance, codebase, mobile):

1. **MySQL bound to `127.0.0.1`** (`C:\xampp1\mysql\bin\my.ini`,
   `bind-address=127.0.0.1`; the previous file is kept next to it as
   `my.ini.rgarage-backup`). It previously listened on every interface with a
   passwordless `root`, so the whole ledger was reachable from the shop
   Wi-Fi. phpMyAdmin and the app (localhost) are unaffected. Takes effect
   after MySQL is restarted in the XAMPP Control Panel.
2. **API bound to `127.0.0.1`** (`backend/src/server.ts`, `HOST` env,
   default `127.0.0.1`). Only the Next.js proxy must reach it, so the API no
   longer answers the LAN directly. Public deploys (Render) set
   `HOST=0.0.0.0`.
3. **Automatic backups**: `scripts/backup-db.bat` writes a dated mysqldump to
   `backups/hardware_inventory_YYYY-MM-DD_HH-mm-ss.sql` and keeps 14 days
   (`silent` argument skips the pause); `scripts/restore-db.bat <dump.sql>`
   restores with a confirmation prompt. `run-app.bat` runs the backup once
   per day at startup; a daily Task Scheduler entry is documented in the
   README as optional. Both scripts use XAMPP's default passwordless `root`;
   adjust them if that ever changes.
4. **iOS zoom-on-focus fixed**: iOS Safari zooms the page when a form field
   smaller than 16px gets focus. `globals.css` forces 16px controls below
   768px (`!important` beats the smaller text utilities).
5. **Daily Report fits phones**: the product-lines table (`min-w-[560px]`)
   renders as a stacked list below `md`; the full table stays for desktop and
   print (`print:block`).
6. **Small GET cache** (`frontend/src/lib/use-cached-api.ts`): a
   stale-while-revalidate cache built on `useSyncExternalStore` (still no
   data library, per D-12's spirit). Every mount/path change revalidates;
   revisits paint instantly from memory; a failed background refresh keeps
   the cached data and stays silent (the next visit retries). Writes call
   `invalidateApiCache()` — blanket where nothing else is mounted, prefix-
   scoped where the current screen owns the data — and screens that must
   update themselves call the hook's `refresh()`. Applied to dashboard,
   inventory, sales history, stock movements, daily report, and the sales
   form's product list; mutation screens (save/void/stock/count/product
   edits) invalidate.
7. **Service worker caches only immutable assets**: `public/sw.js` stays
   network-only for pages and API (D-20's guarantee intact), but
   `/_next/static/*` is cache-first (content-hashed names cannot go stale)
   and icons/logo are stale-while-revalidate. One cache
   (`rgarage-static-v1`); old caches are deleted on activate.
8. **Security headers** (`frontend/next.config.ts`): `poweredByHeader:
   false`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: same-origin`, restrictive `Permissions-Policy`. A CSP
   is deferred to the public deployment, where it can be tested against
   Next's inline scripts.
9. **Launcher v2 / update script**: `run-app.bat` verifies MySQL is running,
   takes the daily backup, starts both windows, polls `/health` and the
   login page until they answer, opens the browser, and builds the frontend
   automatically if `.next` is missing. `update-app.bat` runs `git pull`,
   installs, and rebuilds after new code lands.
10. **Shared list-page pieces**: `PaginationBar` (sales history, movements)
    and `EmptyState` reuse replace hand-rolled copies.

## D-24 - Managed-MySQL TLS and the path to an online deployment

Deploying to Render requires MySQL the cloud can reach, and managed
providers (Aiven — the recommended always-free host — DigitalOcean, TiDB)
require or support TLS. `DB_SSL=true` now switches the mysql2 pool
(`src/lib/db.ts`) and every `db:*` script to TLS; optional `DB_SSL_CA`
(pasted PEM — real newlines or `\n` escapes) additionally verifies the
server certificate instead of only encrypting. Local XAMPP MySQL is
untouched: with `DB_SSL` unset, nothing changes. `npm run db:import --
<dump.sql>` (new, `scripts/db-import.ts`, verified against a scratch
database) loads any `backup-db.bat` dump into the configured server — it is
how the shop's data moves to the cloud host, and it can restore anywhere
else the app can connect. An optional `--database <name>` redirects the
dump into a different database — its CREATE DATABASE is skipped and its
USE statement rewritten — which is how a dump lands in a provider's fixed
database (Aiven's free plan: `defaultdb`). The process environment wins
over `.env.local`, so a cloud import needs no permanent config changes on
the shop PC. The Render layout stays D-18's two Web Services; there the
API additionally needs `NODE_ENV=production` (login cookie gets `Secure`
over HTTPS) and `HOST=0.0.0.0` (D-23's loopback default is LAN-only), and
the UI needs `BACKEND_URL`. A `render.yaml` blueprint (repo root,
validated against Render's published JSON schema) commits all of that:
both free services in Singapore, `/health` check, Render-generated
`AUTH_SECRET`, `DB_SSL` pre-set, and the two services cross-wired via
`RENDER_EXTERNAL_URL` — deploying is *New + → Blueprint → Apply* with four
prompted database secrets. Aiven's free plan powers the service off after
long inactivity (email warning + power-on button) — daily use keeps it
awake. README has the click-by-click.

## D-25 - Render cold-start resilience (proxy retries, /ready, DB recovery)

At 06:36 the shop got the branded error screen instead of the login form: the
API free service was asleep, Render answered the server component's
`/api/auth/me` fetch with an HTML wake-up page, and `response.json()` threw
`SyntaxError: Unexpected token '<'`. The login form also reported every failure
as "Is `npm run dev` still running?".

- Frontend proxy (`app/api/[...path]/route.ts`): 45 s per attempt, 90 s total
  budget, bounded exponential backoff with jitter, `Retry-After` honoured.
  Reads are retried; writes are sent once, except provably replay-safe calls
  (login/logout and `/api/sales` with a `requestId`) or errors that prove the
  request never left (`ECONNREFUSED`/DNS/connect timeout). Render's HTML
  502/503/504 pages become the JSON envelope, so the UI never parses HTML.
- Server-side page loads (`lib/backend.ts`) use the same policy and turn a
  non-JSON reply into a clear "waking up" message, not a SyntaxError. The
  login page no longer swallows `redirect()` and sends one fire-and-forget
  wake-up ping; the login button explains a slow wake-up after 6 s.
- Backend: `/health` stays a cheap liveness check; new `/ready` checks the DB
  (cached 10 s, no details leaked). The mysql2 pool gets connect/idle
  timeouts, keep-alive and socket retirement; `getConnection()` pings before
  a transaction; plain SELECTs retry once on a dead socket; writes and
  transactions are never replayed; a failed rollback destroys the connection
  instead of hiding the original error. `SIGTERM` drains requests and closes
  the pool. Structured JSON logs with request ids; production refuses to boot
  with missing config (variable names only) instead of silently using
  localhost.
- Config: `render.yaml` keeps Render's health check on `/health` (never
  `/ready`, or a DB outage would restart a healthy API). New optional
  variables are documented in both `.env.example` files. 20 backend + 40
  frontend unit tests cover retries, budgets, proxy replay safety and DB
  recovery, and CI runs them.

A free-plan cold start itself cannot be removed (30-60 s, worst case two
wake-ups in a row); the app now waits safely, says why, and recovers without
a Blueprint restart or manual restart of either service.
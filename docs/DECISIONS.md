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
returns NULL and silently breaks filters).

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
`scripts/acceptance.ps1` (auth, catalog, sales posting, base/final pricing,
idempotency, oversell rejection, stock ops, reports, void/audit,
deactivation). It mutates data and is meant for dev machines.

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

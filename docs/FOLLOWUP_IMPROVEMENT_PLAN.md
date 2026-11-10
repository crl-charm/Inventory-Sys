# Follow-up codebase improvement plan

Updated: 2026-11-08 (Asia/Singapore)  
Workspace: `C:\dev\Inventory-sys`  
Scope: Local-only follow-up improvements after completing the six-phase plan in `docs/IMPROVEMENT_PLAN.md`. Nothing has been pushed, deployed, or run against the live shop database.

## Overview

| # | Workstream | Priority | Target files | Status |
|---|---|---|---|---|
| 1 | Windows local `npm run build` reliability & root workspace cleanup | High | `frontend/package.json`, `frontend/next.config.ts`, `package.json`, stale root `node_modules/` | **Completed & verified** |
| 2 | Login rate-limit client IP forwarding & anti-spoofing | Medium | `frontend/src/app/api/[...path]/route.ts`, `backend/src/server.ts`, `backend/src/lib/auth.ts`, `backend/src/api/auth/login/route.ts`, `backend/src/lib/auth.test.ts`, `frontend/src/app/api/proxy.test.ts` | **Completed & verified** |
| 3 | Sales entry multi-price lines for the same product & summed stock checks | Medium | `frontend/src/components/sales-entry-form.tsx`, `frontend/src/components/sales-entry-form.test.ts` | **Completed & verified** |
| 4 | Pre-split dead code removal & shared DB script configuration | Low | `frontend/src/lib/dates.ts`, `frontend/src/lib/errors.ts` (deleted), `backend/src/api/**/route.ts`, `backend/scripts/db-config.ts`, `backend/scripts/*.ts` | **Completed & verified** |
| 5 | Launcher dynamic LAN IP & acceptance script alignment | Low | `run-app.bat`, `backend/scripts/acceptance.ps1` | **Completed & verified** |
| 6 | Wire URL query parameters on Inventory & Edit Product (`?stockStatus=`, `?updated=1`, `?created=1`) | High | `frontend/src/app/(app)/inventory/page.tsx`, `frontend/src/components/inventory-table.tsx`, `frontend/src/app/(app)/inventory/[id]/edit/page.tsx`, `frontend/src/components/inventory-and-forms.test.ts` | **Completed & verified** |
| 7 | Preserve distinct unit prices in daily product breakdown (`getDailyProductBreakdown`) | Medium | `backend/src/services/report-service.ts`, `frontend/src/components/daily-report-view.tsx`, `frontend/src/components/dashboard-view.tsx`, `backend/src/services/report-service.test.ts` | **Completed & verified** |
| 8 | Replace raw numeric Product ID filter on Stock Movements with product selector & deep link | Medium | `src/app/(app)/inventory/movements/page.tsx`, `src/components/movements-view.tsx`, `src/components/product-row-actions.tsx`, `src/components/inventory-and-forms.test.ts` | **Completed & verified** |
| 9 | Form label-control associations & inline category Enter-key handling in `ProductForm` | Low | `src/components/product-form.tsx`, `src/components/inventory-and-forms.test.ts` | **Completed & verified** |
| 10 | Merge API and Web into a single unified Next.js service at repository root | High | `package.json`, `render.yaml`, `run-app.bat`, `update-app.bat`, `src/app/api/**`, `src/app/health/route.ts`, `src/app/ready/route.ts`, `src/lib/backend.ts`, `src/instrumentation.ts` | **Completed & verified** |

---

## Implemented changes

### 1. Windows local `npm run build` reliability & root workspace cleanup

- Removed the stale pre-split `C:\dev\Inventory-sys\node_modules` directory left over from before the `backend/` + `frontend/` split.
- Cleaned root `package.json`: removed the invalid `"@types/node": "^26.6.5"` entry and added root `typecheck`, `lint`, `test`, and `build` convenience scripts.
- Set `turbopack.root: import.meta.dirname` in `frontend/next.config.ts` and updated `frontend/package.json` `"build"` to `"next build --webpack"` so plain `npm run build`, `run-app.bat`, `update-app.bat`, CI, and Render builds succeed without hitting Next.js 16.4.2's Windows PostCSS worker spawn panic under Node 24.

### 2. Login rate-limit client IP forwarding & anti-spoofing

- In `backend/src/server.ts` (`toRequest`), stripped any incoming `x-socket-ip` header and populated `x-socket-ip` exclusively from `req.socket.remoteAddress`.
- In `frontend/src/app/api/[...path]/route.ts`, forwarded the connecting client IP (`cf-connecting-ip` / `true-client-ip` / rightmost `x-forwarded-for` hop) to the backend as `x-forwarded-for`.
- Added `resolveClientIp(request)` in `backend/src/lib/auth.ts` and wired `backend/src/api/auth/login/route.ts` to use it: proxy headers (`cf-connecting-ip`, `true-client-ip`, or the rightmost `x-forwarded-for` hop — never the spoofable leftmost client entry) are trusted only from loopback proxies, unit-test requests, or production reverse proxies, preventing both cross-device shop lockouts (`ip === "local"`) and `X-Forwarded-For` header spoofing.
- Added unit tests in `backend/src/lib/auth.test.ts` and `frontend/src/app/api/proxy.test.ts`.

### 3. Sales entry multi-price lines & summed stock validation

- Assigned each `Line` in `SalesEntryForm` (`frontend/src/components/sales-entry-form.tsx`) a unique client `key` (`newRequestId()`) used for table/card React keys and mobile `<label htmlFor>` / `<input id>` pairs so duplicate product lines never collide in the DOM.
- Kept already-added active products selectable in the picker (with an `"In list"` badge) so clerks can record multiple unit prices for the same product in a single batch (`D-09`).
- Summed requested quantities in integer thousandths (`parseQuantityToThousandths`) per `productId` across all lines in the batch so combined stock-exceeded warnings highlight immediately when split lines exceed `stockOnHand`.
- Added jsdom coverage in `frontend/src/components/sales-entry-form.test.ts` verifying multi-price lines, unique DOM IDs, combined stock-limit warnings, and `POST /api/sales` payload submission.

### 4. Pre-split dead code removal & shared DB script configuration

- Removed unused server-only helpers (`requireDateString`, `dbDateToString`, `storeDayToUtcBoundary`, `assertNotFutureDate`) from `frontend/src/lib/dates.ts`, aligned `isValidDateString` (`1000..9999` year bounds) with `backend/src/lib/dates.ts`, and deleted dead `frontend/src/lib/errors.ts`.
- Removed dead Next.js `export const runtime = "nodejs";` exports from 10 route modules under `backend/src/api/`.
- Extracted `backend/scripts/db-config.ts` (`readDbScriptConfig`, `sslOption`) importing `../src/load-env` and refactored `db-init.ts`, `db-migrate.ts`, `db-import.ts`, `db-ping.ts`, `db-backup.ts`, and `seed-owner.ts` to share it without altering CLI flags or error messages.

### 5. Launcher dynamic LAN IP & acceptance script alignment

- Updated `run-app.bat` to detect the active non-virtual LAN IPv4 address dynamically via `.NET NetworkInterface` (`http://<LAN-IP>:3000`) instead of hardcoding `192.168.68.102`, with a clear `ipconfig` fallback message when offline.
- Updated `backend/scripts/acceptance.ps1` header comments (`npm run dev:backend` / `npm run dev:frontend` / `run-app.bat`, `-File backend\scripts\acceptance.ps1`) and defaulted `$OwnerUsername` to `$env:SEED_OWNER_USERNAME` (falling back to `"owner"`).

### 6. Wire URL query parameters on Inventory & Edit Product (`?stockStatus=`, `?updated=1`, `?created=1`)

- Updated `frontend/src/app/(app)/inventory/page.tsx` to read `searchParams` (`stockStatus`, `updated`, `created`) and pass `initialStockStatus` and `initialNotice` into `InventoryTable`.
- Updated `frontend/src/components/inventory-table.tsx` to initialize and sync `stockStatus` from `initialStockStatus` (so Dashboard's `"Review"` link `/inventory?stockStatus=low_stock` filters to low-stock items immediately) and display `"Changes saved."` / `"Product added."` notices when redirected with `?updated=1` or `?created=1`.
- Updated `frontend/src/app/(app)/inventory/[id]/edit/page.tsx` to read `searchParams` and render a dismissible `"Product added."` confirmation banner when redirected from `/inventory/new` to `/inventory/[id]/edit?created=1`.

### 7. Preserve distinct unit prices in daily product breakdown (`getDailyProductBreakdown`)

- Updated `getDailyProductBreakdown` in `backend/src/services/report-service.ts` to select `si.final_unit_price` and group by `si.product_id, p.name, p.sku, si.unit_of_measure, si.final_unit_price`, returning `finalUnitPrice` on each `DailyProductLine` instead of collapsing different price points into a single row.
- Updated `frontend/src/components/daily-report-view.tsx` and `frontend/src/components/dashboard-view.tsx` to render `line.finalUnitPrice` (falling back to `totalAmount / quantity` only if absent) and key rows by `${line.productId}-${line.unit}-${unitPrice}`.
- Added unit coverage in `backend/src/services/report-service.test.ts`.

### 8. Replace raw numeric Product ID filter on Stock Movements with product selector & deep link

- Updated `frontend/src/app/(app)/inventory/movements/page.tsx` to pass `searchParams.productId` (`initialProductId`) into `MovementsView`.
- Updated `frontend/src/components/movements-view.tsx` to replace the raw numeric `<input placeholder="e.g. 12">` with a `<select id="movements-product-filter">` populated from `/api/products` (`All products` + `${product.name} (${product.sku})`) and added `htmlFor`/`id` bindings across all filter controls.
- Added a `"View all movements"` deep link (`/inventory/movements?productId=${product.id}`) in `frontend/src/components/product-row-actions.tsx` next to `"Recent stock activity"`.

### 9. Form label-control associations & inline category Enter-key handling in `ProductForm`

- Added `htmlFor` on `Field` and matching `id` attributes on all inputs/selects/textareas in `src/components/product-form.tsx`.
- Added `onKeyDown` handling on the inline `"New category name"` input so pressing `Enter` calls `handleCreateCategory()` (`e.preventDefault()`) instead of submitting the outer product form, and pressing `Escape` closes the inline category input.
- Added jsdom tests in `src/components/inventory-and-forms.test.ts` covering `InventoryTable`, `MovementsView`, `ProductRowActions`, and `ProductForm`.

### 10. Merge API and Web into a single unified Next.js service at repository root

- Flattened `backend/` and `frontend/` into a single unified Next.js 16 application at the repository root (`C:\dev\Inventory-sys`) with one `package.json`, one `src/` tree, `database/`, `scripts/`, and `tests/`.
- Moved all API routes directly into `src/app/api/**/route.ts`, added `/health` (`src/app/health/route.ts`) and `/ready` (`src/app/ready/route.ts`), and removed the cross-service HTTP proxy (`src/app/api/[...path]/route.ts`), `BACKEND_URL`, and the separate `rgarage-api` server (`server.ts`).
- Updated `src/lib/backend.ts` and `src/app/(auth)/login/page.tsx` to execute Server Component data/session reads directly in-process with zero HTTP hops, and updated `src/instrumentation.ts` to warm the MySQL pool in the background on server boot.
- Updated `render.yaml` to deploy a single `rgarage-web` service at the root (so a single cron job pinging `/health` keeps the entire app awake) and updated `run-app.bat` / `update-app.bat` to manage a single unified server on port `3000`.

---

## Verification checklist

- [x] `npm run typecheck` — **Passed** (`tsc --noEmit`, 0 errors)
- [x] `npm run lint` — **Passed** (`eslint .`, 0 errors, 0 warnings)
- [x] `npm test` — **Passed** (**78/78** unit and jsdom tests across 17 test files)
- [x] `npm run test:integration` — **Passed** (**17/17** integration tests against disposable MariaDB 10.4 on `127.0.0.1:3307` with native `mysqldump.exe`; `.tmp-test-db` stopped and removed)
- [x] `npm run build` — **Passed** (`next build --webpack`, all UI and API routes compiled and `.next/BUILD_ID` generated)
- [x] `git diff --check` — **Passed** (0 whitespace/EOF errors)

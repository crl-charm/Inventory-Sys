# Codebase improvement handoff

Updated: 2026-11-08 (Asia/Singapore)  
Workspace: `C:\dev\Inventory-sys`  
Branch: `main`  
Current HEAD: `34ff35b` — `fix(web): survive long API wakes without a stuck spinner`

## Current status: local implementation and verification complete

All local static checks, unit suites, jsdom tests, disposable MariaDB
integration tests (including native backup/restore), diff formatting checks,
and the production frontend build have now passed on the current working tree.

Per the user's instruction (**"just local only first"**):
- Nothing has been committed, pushed, or deployed.
- The real local shop database on `127.0.0.1:3306` was not touched.
- The pre-existing untracked `docs/RENDER_RELIABILITY_FIX_GUIDE.md` was preserved untouched.
- The disposable MariaDB test server on `127.0.0.1:3307` was cleanly shut down and `C:\dev\Inventory-sys\.tmp-test-db` was removed after verification.

## Final verification results (2026-11-08)

| Check | Command | Result |
|---|---|---|
| Diff formatting | `git diff --check` | **Passed** (0 whitespace/EOF errors; only standard Windows CRLF notices). |
| Unified typecheck | `npm run typecheck` | **Passed** (`tsc --noEmit`, 0 errors). |
| Unified lint | `npm run lint` | **Passed** (`eslint .`, 0 errors, 0 warnings). |
| Unified unit + DOM tests | `npm test -- --silent` | **Passed** (**78/78** tests across 17 files, including `resolveClientIp` anti-spoofing, per-IP login lockout isolation, `getDailyProductBreakdown` distinct unit-price grouping, `parseJsonBody` 1 MiB limit, and jsdom tests for `Modal`, `SalesEntryForm`, `InventoryTable`, `MovementsView`, `ProductRowActions`, and `ProductForm`). |
| Disposable DB integration suite | `npm run test:integration` (against disposable MariaDB 10.4 on `127.0.0.1:3307` with `TEST_MYSQL_DUMP_PATH=C:\xampp1\mysql\bin\mysqldump.exe`) | **Passed** (**17/17** tests, including reconciled stock ledger query, preserved `created_at`/`updated_at` and new UTC migration metadata in `0002_datetimes_to_utc`, `db:check` rejection/acceptance, concurrent sales request reservation, and native `db:backup`/`db:import` round trip + retention). |
| Production build | `npm run build` | **Passed** (compiled, typechecked, generated all UI and `/api/*` routes in a single unified Next.js bundle, and wrote `.next/BUILD_ID`). |

### Fixes applied during final verification

1. `backend/src/services/stock-service.ts`: removed the trailing blank line at EOF flagged by `git diff --check`.
2. `frontend/src/components/modal.tsx` and `frontend/src/components/modal.test.ts`: made `Modal`'s `children` prop optional (`children?: React.ReactNode`) and passed child elements as `createElement` arguments rather than a `children` prop so both `eslint` (`react/no-children-prop`) and `tsc --noEmit` succeed cleanly.

## What has been implemented

| Original phase | Current implementation |
|---|---|
| 1. Disposable database verification | Dedicated loopback MariaDB test server on port 3307; random test schemas with cleanup; integration suite and CI database service. The live-data acceptance script stays outside CI. |
| 2. Catalog and sales correctness | Inventory uses the existing pagination hook/control. Sales picker searches `/api/products/lookup`, including products beyond the first 100. Sales reserve the unique request ID before stock checks and store a normalized request hash. Matching retries return the same sale; changed contents conflict. |
| 3. Migration and upgrade safety | Fresh schemas record migration versions. Ambiguous historical timestamps require an explicit choice. Migration runners use a database-specific advisory lock. `db:check` checks compatibility without modifying data; backend `npm start` runs it. Updater backs up, pulls with `--ff-only`, installs locked dependencies, migrates, then builds. |
| 4. Cache and wake recovery | Central cache invalidation refetches mounted hooks and rejects stale in-flight results. Authentication boundaries clear cached data. Frontend logout clears its cookie locally, even if the API is unavailable. Wake route now probes `/ready`. |
| 5. API and keyboard hardening | API and frontend proxy cap request bodies at 1 MiB. IDs, finite integer pagination, date ranges and filters are validated. Signed sessions re-check account activity. Modal traps Tab/Shift+Tab, handles Escape, preserves input focus on rerender and restores the trigger on close. |
| 6. CI and documentation | Dummy README-commit workflow deleted. CI uses the integration suite and a native dump client for backup/restore checks. README, database guide, environment example, decisions log and improvement map updated. |

## Important operational details for next steps (local shop DB upgrade / rollout)

- **Upgrading the local shop database (`127.0.0.1:3306`)**:
  `backend` `npm start` now runs `npm run db:check && tsx src/server.ts`. Before starting the updated backend against an existing shop database:
  1. Stop the running Backend and Frontend windows so no writes occur.
  2. Run `npm run db:backup` and confirm a fresh `.sql` dump exists in `backups/`.
  3. Run `npm run db:migrate`. If the database already has the current table columns without a `0002_datetimes_to_utc` record, choose explicitly between `npm run db:migrate -- --already-utc` (preserve timestamps) or `npm run db:migrate -- --legacy-local-datetimes` (shift legacy UTC+8 timestamps once).
  4. Run `npm run db:check` to confirm compatibility.
- **Follow-up improvements completed (`docs/FOLLOWUP_IMPROVEMENT_PLAN.md`)**:
  All 9 follow-up workstreams (Windows `npm run build` reliability + root workspace cleanup, proxy client IP forwarding + login rate-limit anti-spoofing, multi-price lines per product + summed stock checks in `SalesEntryForm`, pre-split dead code removal + shared `backend/scripts/db-config.ts`, dynamic LAN IP detection in `run-app.bat` + `acceptance.ps1` alignment, Inventory/Edit Product query-param wiring, distinct unit-price grouping in `getDailyProductBreakdown`, Stock Movements product selector + deep link, and `ProductForm` label-control associations + inline category Enter-key handling) are implemented and verified locally.
- **Browser smoke check**:
  Local browser control was disabled in Work settings, so modal focus trapping and mounted cache refresh were verified via jsdom. When running the app locally in a browser, smoke-test Inventory pagination (page 2), sales picker lookup, stock refresh after writes, sign-out while the API is stopped, and modal `Tab`/`Shift+Tab`/`Escape`.
- **Committing when ready**:
  Stage all modified, deleted (`.github/workflows/activity.yml`), and new implementation/test/doc files, while keeping `docs/RENDER_RELIABILITY_FIX_GUIDE.md` untracked unless the owner wants it included.

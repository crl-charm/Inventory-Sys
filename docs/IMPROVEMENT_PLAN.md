    # Improvement plan completion

Scope: the original six-phase codebase plan, completed and verified locally on
2026-11-08. Live shop database upgrade and production deployment remain deferred
at the owner's request ("just local only first").

| Phase | Implementation | Verification evidence |
|---|---|---|
| 1. Disposable database verification | Dedicated loopback test server on port 3307, random schemas, cleanup, and CI MariaDB service. Live-data acceptance script excluded from CI. | `npm run test:integration`: **17/17 passed** against disposable MariaDB 10.4 on `127.0.0.1:3307` with native `mysqldump.exe`. |
| 2. Catalog and sales correctness | Inventory pagination, server product lookup, request fingerprints, unique request reservation before stock checks. | 101-product pagination/lookup, identical concurrent replay, changed-payload 409 rejection, oversell prevention, ledger reconciliation, and numeric-boundary tests passed. |
| 3. Migration and upgrade safety | Fresh schema baseline; explicit UTC choice when ambiguous; preserve historical `created_at`/`updated_at` and new UTC migration metadata; migration lock; schema gate (`db:check`) before server startup. Updater backs up before migration. | Fresh/legacy/concurrent migration tests, read-only `db:check` rejection/acceptance tests, configured-database `db:init`/`db:import`, and native `db:backup` + `db:import` round trip passed. |
| 4. Cache and wake recovery | Unified single-service Next.js architecture (zero cross-service HTTP hops); mounted views refetch after writes; stale reads cannot refill cache; auth boundaries clear data. Local logout expires the cookie without the DB; `/api/wake` and `/ready` check MySQL readiness in-process. | Cache race and jsdom mounted-hook tests, offline logout tests, and `/api/wake` readiness tests passed (`78/78` unit/jsdom tests across 17 files). |
| 5. API and keyboard hardening | 1 MiB body size limits in `parseJsonBody` and `readRequestBody`; finite integer pagination, ID/date/filter validation, current active-account checks, anti-spoofing per-IP login rate limiting. Modal traps Tab/Shift+Tab, handles Escape, preserves input focus on rerender, and restores focus. | Unified unit + jsdom test suite (**78/78 passed**) including `modal.test.ts`, `sales-entry-form.test.ts`, `inventory-and-forms.test.ts`, and `api-response.test.ts`. |
| 6. CI and documentation | Dummy README activity workflow removed; unified root `package.json` and single Render service (`render.yaml`); README, database guide, decisions, and handoff docs updated. | `npm run typecheck`, `npm run lint`, `git diff --check`, and production build (`npm run build`) passed. |

## Operational notes

- The API's runtime SQL user still needs only `SELECT`/`INSERT`/`UPDATE`/`DELETE`;
  migration and backup commands need appropriate schema and dump privileges.
- No backup, migration, or acceptance script was run against the real shop
  database (`127.0.0.1:3306`). Before starting the updated backend against an
  existing database, stop writes, run `npm run db:backup`, run
  `npm run db:migrate` (passing `--already-utc` or `--legacy-local-datetimes` if
  prompted for an unmarked current schema), and verify with `npm run db:check`.
- Old sales without a `request_hash` retain safe replay behavior because their
  original submitted request body cannot be reconstructed reliably.
- `frontend/package.json` uses `next build --webpack` (with `turbopack.root` configured in `frontend/next.config.ts`) so `npm run build`, `run-app.bat`, `update-app.bat`, Linux CI, and Render builds succeed reliably without hitting Next.js 16.4.2's Windows PostCSS worker spawn panic on Node 24. See `docs/FOLLOWUP_IMPROVEMENT_PLAN.md` for all nine follow-up workstreams completed afterward.
- Browser control is disabled in Work settings, so modal keyboard trapping and
  mounted cache invalidation were verified in jsdom. A native browser smoke test
  remains recommended when browser access is enabled or during local rollout.

# Phase 35 Post-Commit Scout Report

**Date:** 2026-07-18 | **Branch:** main | **Last commit:** `chore(phase-35): R3 crypto tests pass, clean up orphaned files`

---

## Q1: Branch & Last Commit
- **Branch:** `main`
- **Last commit:** `43c4415d2 chore(phase-35): R3 crypto tests pass, clean up orphaned files`

---

## Q2: Failing Tests — Categorized

**Total failures:** 119 test cases across ~30 files | **Passing:** ~3494

### (a) Phase 35 Integration Gap Failures (THE ones to fix for Phase 35 completion)
1. `tests/integration/winston-logger-config-discipline-sync.test.ts` — 8 FAILs
   - Tests require **winston** + `createLogger` + JSON production format + file transports + rotation bounds
   - **Reality:** `src/shared/utils/logger.ts` is a lightweight console wrapper (no winston, no winston exports, no defaults)
2. `tests/integration/shared-utils-contract.test.ts` — 2 FAILs
   - Checks `LOG_LEVEL` env with "info" default + both named `{ logger }` & default export
   - **Reality:** Level is hardcoded `'info'` (no env read); named export exists but no `LOG_LEVEL` env binding
3. `tests/integration/signal-ingest-hmac-contract-discipline-sync.test.ts` — 2 FAILs
   - Checks: `rate-limit windowMs=60000 + max=60` on ingest route + composite 10-axis
   - **Reality:** Signal ingest route has HMAC auth/validation but the regex for `windowMs: 60_000` / `windowMs: 60000` pattern doesn't match current code
4. `tests/integration/express-server-security-middleware-discipline-sync.test.ts` — 2 FAILs
   - Checks: `rateLimit` imported AND applied to `/api` path scope + 8-axis composite
   - **Reality:** server.ts line 113 uses `rateLimitMiddleware()` globally (no `/api` scope) — mismatch
5. `tests/integration/platform-api-contract.test.ts` — 1 FAIL
   - Rate limiter middleware existence check

### (b) DB-Blocked Failures (need Postgres to run)
6. `src/platform/api/__tests__/api.test.ts` — API Server
7. `src/platform/audit/__tests__/tenant-audit-chain.test.ts` — Error: `Cannot find module '/src/platform/db/postgres-client'`
8. `src/platform/raas/__tests__/subscriber-executor.test.ts`
9. `src/platform/api/routes/__tests__/audit-routes.test.ts`
10. `src/api/routes/__tests__/enterprise-inquiry-routes.test.ts` — POST/PATCH /inquiries
11. `src/platform/billing/__tests__/subscription-service.test.ts` — 3 FAILs (getSubscription, activateSubscription, cancelSubscription)
12. `src/desk/execution/__tests__/live-trading-journal.test.ts` — 5 FAILs
13. `src/desk/execution/__tests__/polymarket-adapter.test.ts` — 8 FAILs (auth/signing tests)

### (c) Pre-existing Failures (unrelated to Phase 35)
14. `tests/integration/tsconfig-variant-coherence-discipline-sync.test.ts` — 1 FAIL
15. `tests/integration/wrangler-cloudflare-deploy-discipline-sync.test.ts` — 2 FAILs
16. `tests/integration/desk-platform-boundary.test.ts` — 1 FAIL
   - Expected (known document boundary exception; see Q7)
17. `src/platform/api/__tests__/rate-limit.test.ts` — 3 FAILs (Redis ECONNREFUSED)
18. `src/desk/strategies/__tests__/loader.test.ts` — 13 FAILs (StrategyLoader singleton)
19. `src/desk/risk/__tests__/kelly-position-sizer.test.ts` — 2 FAILs (capital cap logic)

---

## Q3: src/platform/api/server.ts — Rate Limiter State
- **Does use new RedisRateLimiter:** Yes, line 45 imports `rateLimitMiddleware` from `../../forest/rate-limit`, line 113 applies with `this.app.use(rateLimitMiddleware())`
- **Old in-memory express-rate-limit:** Not imported; fully replaced
- **Scope mismatch:** Applied GLOBALLY to all routes (`this.app.use(...)`), NOT scoped to `/api`. The integration test at `express-server-security-middleware-discipline-sync.test.ts` expects it to be mounted on `/api` specifically. Health checks at `/health` don't need rate limiting, so this is a real issue identified by the discipline test.

---

## Q4: src/forest/rate-limit/index.ts Exports
```
export { RedisRateLimiter, rateLimiter, rateLimitMiddleware, TIER_RATE_LIMITS,
         DEFAULT_TIER_LIMITS, type TierRateLimits, type RateLimitResult,
         type RedisRateLimiterOptions, type RateLimitMiddlewareOptions }
```
All 9 exports are present from `./redis-rate-limiter`. `TIER_RATE_LIMITS` maps tiers (FREE/PRO/ENTERPRISE/MASTER); MASTER has `0/0` (unlimited). `rateLimitMiddleware` is an Express middleware factory that sets `X-RateLimit-*` headers + `Retry-After` on 429.

---

## Q5: Logger Module — Project-Wide State
**9 logger files exist:** `src/utils/`, `src/shared/utils/`, `src/platform/utils/`, `src/desk/utils/`, `src/desk/core/`, `src/engine/core/`, `src/deck/utils/`, `src/deck/intelligence/utils/`, `src/deck/shared/utils/`
- **Canonical logger** (used by server.ts, rate-limit, audit-middleware): `src/shared/utils/logger.ts`
- **Current implementation:** Lightweight console wrapper — `export const logger` (named) + `export default logger` — both exports exist
- **Level:** Hardcoded `'info'` — no `LOG_LEVEL` env read
- **Uses `console.warn` and `console.error`** (lines 46, 49) — `shared-utils-contract.test.ts` checks for these being present
- **`shared-utils-contract.test.ts`** checks: logger has methods (info/warn/error/debug), reads `LOG_LEVEL` env with "info" default, has both named and default exports.

---

## Q6: signal-ingest-hmac-contract-discipline-sync.test.ts — Rate Limit Check
- **What it checks (case 7):** The source of `src/platform/api/routes/signal-ingest-routes.ts` is read as text and regex-matched for:
  - `windowMs` matching `60_000` or `60000`
  - `max` matching `60`
  - Pattern: `rate-limit: windowMs=60000 + max=60 (denial-of-wallet prevention)`
- **Likely failing cause:** The rate limit config in `signal-ingest-routes.ts` either doesn't have those exact values, or the regex doesn't match the formatting style in the actual file.

---

## Q7: desk-platform-boundary.test.ts — Boundary Violation
- **Test checks:** `platform/` isolation — specifically verifies `platform/` modules only import from `shared/` and other `platform/` modules (NOT from `desk/`)
- **Specific failure:** "platform/ imports only from shared/ and other platform/ modules" — some platform file imports from `desk/`
- **Known exceptions list** (lines 84-107): The test has an `ALLOWED_PLATFORM_IMPORTS` regex list for platform→desk imports including: `desk/strategies`, `desk/signal`, `desk/risk`, `desk/intelligence`, `desk/arbitrage`, `desk/engine`, `desk/gate/raas-gate`, `desk/jobs`, `desk/ironclaw`, `desk/feeds`, `desk/wiring`, `desk/execution`
- **Boundary violated:** A platform file likely imports from a desk path NOT in the allowed list, or the regex pattern doesn't match the actual import path.

---

## Q8: Plans with in_progress/next (excluding Phase 35)
1. **`260702-1411-go-live-week-1`** — status: `in_progress` (Phase 6 complete)
2. **`260702-1516-monitoring-stack`** — status: `in_progress` (Phases 1-4 complete)
3. **`260703-1141-revenue-readiness`** — status: `in_progress`

Phase 35 itself is `status: pending` (all 3 sub-phases also `pending`).

---

## Q9: Phase 35 Acceptance Criteria — Remaining Needs
From plan.md:

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `tsc --noEmit` → 0 errors | Needs verification |
| 2 | `npm test` → all pass | **FAIL** — 119 test failures remain |
| 3 | grep `:any` in src/phase-35-files → 0 match | Needs grep |
| 4 | grep `console.(log\|warn\|error)` in phase-35-files → 0 (except logger) | Needs grep |
| 5 | All 7 CI gates pass | Not verified |
| 6 | Audit log queries by tenantId use composite index | Needs R1 phase check |
| 7 | Rate limiter returns `Retry-After` header on 429 | ✅ Implemented in code |
| 8 | MASTER tier has no rate limit (unlimited) | ✅ `requestsPerMin: 0` |
| 9 | `tenant_credentials.api_key/api_secret/passphrase/private_key` encrypted in DB | Needs R3 audit |
| 10 | Migration script handles existing plaintext data | Needs R3 check |

---

## Q10: vitest.config.ts — Test Configuration
- **`pool: 'forks'`** — each test file runs in isolated process fork
- **Globals:** `true` (vitest globals enabled)
- **Include:** `tests/**/*.{test,spec}.{ts,...}` + `src/**/__tests__/**/*.{test,spec}.{ts,...}`
- **No custom `setupFiles`** — no global test hooks for `:any` or console patterns
- **Aliases:** `@shared`, `@desk`, `@platform`, `@forest`, `@redis`
- **No `defineConfig` `test.setupFiles` or `globalSetup`** explained in config — the `:any` and `console.log` failures come from the **discipline-sync test helpers** that read source files as text and regex-match for patterns, not from vitest config guidance

---

## Patterns Observed
1. **Discipline-sync tests** dominate failures — these are source-code regex validators, not runtime tests. They read `.ts` files as text and assert invariants via regex.
2. **Logger mismatch is the #1 cause:** Tests expect winston-based logger; implementation uses a console wrapper. Fixing this likely clears 10+ failures.
3. **Rate limiter scope mismatch:** Applied globally in server.ts; tests expect `/api` scope.
4. **9 separate logger files** — consolidation risk; `src/shared/utils/logger.ts` is canonical but other `logger.ts` files may diverge.
5. **Plan status vs reality:** Phase 35 plan says `pending`, but 34 files were already committed. The acceptance criteria are the real gate.

## Risks
1. **Winston test expectations don't match Cloudflare Workers constraint** — Winston File transport crashes in Workers. Logger must remain console-only. Tests need updating OR logger must add winston-like API surface.
2. **Global vs `/api` rate limit scope** — health/metrics endpoints may get throttled in production if left global.
3. **Multiple logger files** — 9 copies means 9 spots for `console.log` violations to hide.
4. **120 tests need fixing** before Phase 35 can be marked complete.

## Unresolved Questions
1. Should the logger keep winston compatibility surface while using console backend? (Cloudflare Workers constraint vs test expectations)
2. Should rate limiting be scoped to `/api` specifically, and health excluded? (test says yes, but current global mount works)
3. Is the `shared/ utils/ logger.ts` `console.warn/error` acceptable per plan criteria (says "except via logger")?
4. Are the `in_progress` plans (go-live-week-1, monitoring-stack, revenue-readiness) stales or actively maintained?
5. Where is the Postgres client? `tenant-audit-chain.test.ts` fails with `Cannot find module '/src/platform/db/postgres-client'`

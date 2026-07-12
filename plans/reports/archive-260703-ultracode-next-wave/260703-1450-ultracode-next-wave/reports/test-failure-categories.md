# Vitest Test Failure Categorization

Generated from `npx vitest run 2>&1` on 2026-07-07.

---

## Summary

| Category | Test Suites | Approx. Tests |
|---|---|---|
| 1. Module not found / import path errors | 9 | ~25 |
| 2. Connection errors (ECONNREFUSED) | 1 | 7 |
| 3. Assertion/behavior mismatches | ~40 | ~130 |
| 4. Build/transform errors | 5 | ~10 |
| 5. Other | 3 | ~4 |
| **Total** | **~58 suites** | **~176 failing tests** |

---

## Category 1: Module not found / Import path errors

**Root cause:** Source files import modules that have been deleted, renamed, or relocated. The missing modules are referenced from production source code (not just test files), meaning the application itself may not compile/runtests/integration/qwen-kill-switch-source-enum-sync.test.ts - ENOENT: `/src/wiring/qwen-drawdown-monitor.ts`
- `tests/integration/qwen-signals-loop-decision-enum-sync.test.ts` - ENOENT: `/src/wiring/qwen-signals-loop.ts`
- `tests/integration/strategy-review-status-enum-sync.test.ts` - ENOENT: `/src/wiring/qwen-signals-loop.ts`
- `tests/integration/admin-qwen-kill-switch-contract-discipline-sync.test.ts` - ENOENT: `/src/api/middleware/require-admin-key.ts`

Other missing files:
- `tests/integration/qwen-e2e-integration.test.ts` - missing `../../utils/hmac-verifier` (from `src/api/routes/signal-ingest-routes.ts`)
- `tests/integration/shard-routing.test.ts` - missing `/src/strategies/router`
- `backups/dormant/src/strategies/GruStrategy.test.ts` - missing `../utils/logger` (dormant code)

### 4.4 Config / missing environment files
- `src/platform/auth/__tests__/auth-server.test.ts` - `[BetterAuth] FATAL: DB_PASSWORD must be set in production`
- `src/index.test.ts` - Transform error (likely config issue)

---

## Category 4: Build / transform errors

- `src/platform/api/__tests__/api.test.ts` - "API Server" - Transform failed with 1 error
- `src/platform/api/__tests__/rate-limit.test.ts` - "Distributed Rate Limiter Integration Tests" - Transform failed with 1 error
- `src/index.test.ts` - "should have correct version" - Transform failed with 1 error
- `tests/e2e/enterprise.spec.ts` - Playwright: test.describe() called in config-imported file
- `tests/e2e/landing.spec.ts` - ditto
- `tests/e2e/navigation.spec.ts` - ditto
- `tests/e2e/pricing.spec.ts` - ditto

---

## Category 5: Other

- `tests/integration/db-migration-numbering-discipline-sync.test.ts` - duplicate migration IDs (021 used twice)
- `tests/integration/docker-compose-service-dependency-coherence-sync.test.ts` - dependency list mismatch (missing postgres)
- `tests/integration/desk-platform-boundary.test.ts` - architecture boundary violation (shared/ imports from platform/)

---

## Notes

- The **module-not-found** errors are the highest-impact: 9 suites fail entirely because production source files import missing modules. These need module paths fixed before any tests in those suites can run.
- The **ECONNREFUSED** failures in qwen-rollback-harness require a running PostgreSQL instance (local `::1:5432` or `127.0.0.1:5432`).
- Many **TypeError** assertion mismatches (e.g., `initPool is not a function`, `setExpectedCandles is not a function`) are likely cascading from the same import-path drift or from mock/DOM-node mismatches in the test environment.
- The 4 e2e Playwright tests fail due to a Playwright v1.39+ config change — `test.describe()` cannot be in files imported by the config. This is a framework version mismatch, not code logic.

``` Status: DONE Summary: 176 failing tests across 58 suites categorized into 5 groups — module-not-found being the most impactful at 9 blocked suites, followed by assertion/behavior mismatches at ~40 suites. Concerns: PostgreSQL must be running for 7 tests in the qwen-rollback-harness suite; the 9 module-not-found suites require production source imports to be fixed before tests can execute. ```

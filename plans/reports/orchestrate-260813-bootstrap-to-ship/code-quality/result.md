# Code Quality Audit Report

**Project:** @mekong/algo-trader v1.1.0
**Date:** 2026-08-13
**Scope:** Full `src/` directory (1,090 TypeScript files, 273 test files)
**tsconfig strict mode:** Enabled

---

## TypeScript Compilation

- **Errors:** 0
- **Warnings:** 0
- **Status:** Clean (`tsc --noEmit` passes)

---

## Lint Issues

**Total:** 288 problems (0 errors, 288 warnings)
**Files affected:** 139

| Category | Count | Severity |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | 259 | Low |
| `@typescript-eslint/no-require-imports` | 18 | Medium |
| Other (stale eslint-disable, etc.) | 11 | Low |

**High-concentration files (unused vars):**

| File | Unused Imports/Vars |
|---|---|
| `src/platform/api/routes/*.ts` | ~30+ unused router/variable declarations |
| `src/api/v1/risk/caculation/service.ts` | `extractAppError`, `RiskCalculationService` |
| `src/desk/strategies/router.ts` | `ExchangeId`, `DEFAULT_EXECUTOR_CONFIG`, `LLM_TIMEOUT_MS`, `MarketRelationship`, `RelationType` |
| `src/desk/cli/cashclaw-trade-commands.ts` | Multiple unused imports |
| `src/platform/routes/nowpayments-webhook.ts` | `NowPaymentsService` |

**`require()` imports (18 occurrences) -- medium risk:**
- `src/api/v1/risk/caculation/handler.ts` (3 require() calls)
- `src/platform/jobs/sync-positions-job.ts`
- `src/utils/sentry-init.ts`
- `src/utils/tracing.ts`
- `src/shared/utils/compression-stream.ts`
- `src/queues/agent-coordinator.ts`

These bypass TypeScript's module resolution and can fail at runtime without compile-time detection.

---

## Type Safety

**`any` usage in production code (excluding tests):** 339 occurrences across 10 files
**`any` usage in test files:** 336 occurrences
**Total across codebase:** 675

### Critical `any` hotspots (production code)

| File | Count | Impact |
|---|---|---|
| `src/desk/polymarket/strategy-registry-full.ts` | 24 | All strategy configs cast via `as any` -- nullifies type safety for entire strategy registry |
| `src/desk/market-data/outlier-detection.ts` | 11 | Return types are `any`, callbacks typed as `(event: any) => void` -- caller gets no type hints |
| `src/desk/strategies/router.ts` | 3 | `env: any` -- Durable Object environment is untyped; any property access compiles |
| `src/desk/strategies/probability-calibrator.ts` | 1 | `LlmRouter` constructed with `as any` config -- no validation of shape |
| `src/desk/strategies/dna/orchestrator.ts` | 3 | `clearTimeout(timer as any)` / `clearInterval(timer as any)` -- timer type mismatch |
| `src/desk/market-data/quality-monitoring-integration.ts` | 2 | Double-cast `providerName as any as MarketDataSource` -- type assertion chain hides validation gap |
| `src/desk/arbitrage/opportunity-detector.ts` | 3 | `exchange as any` on every arbitrage leg -- exchange type unchecked |
| `src/desk/arbitrage/scanner.ts` | 1 | Dynamic `new (ccxt as any)[id]()` -- exchange instantiation fully untyped |

---

## Banned Imports

**Found:** 0
- `@/lib/auth` -- not found
- `@/lib/subscription` -- not found
- `@/lib/unified-tier-config` -- not found
- `@/lib/tier-gate` -- not found

**Status:** Clean

---

## Console Usage in Production

**Count:** 109 occurrences across 15 files (excluding test files, excluding logger utilities)

| File | Count | Category |
|---|---|---|
| `src/desk/cli/cashclaw-cli.ts` | 31 | CLI output (acceptable) |
| `src/desk/cli/cashclaw-trade-commands.ts` | 23 | CLI output (acceptable) |
| `src/risk/backtests/kelly-vs-fixed.backtest.ts` | 30 | Backtest output (acceptable) |
| `src/regions/region-health-monitor.ts` | 7 | **Production service -- should use logger** |
| `src/shared/utils/compression-stream.ts` | 4 | **Shared utility -- should use logger** |
| `src/platform/jobs/trial-drip-runner.ts` | 2 | **Production job -- should use logger** |
| `src/queues/agent-coordinator.ts` | 2 | **Production queue -- should use logger** |
| `src/shared/utils/memory-pool.ts` | 1 | **Shared utility -- should use logger** |
| `src/desk/cli/agent-dispatcher.ts` | 2 | **Service code -- should use logger** |
| `src/commands/*.ts` | 4 | Stub commands (low impact) |
| `src/desk/backtesting/backtest-runner.ts` | 1 | Comment-only (acceptable) |
| `src/platform/dashboard/dashboard-demo-data.ts` | 2 | Demo data strings (acceptable) |

**High-risk console usage (non-CLI production code):** 16 occurrences in 5 files that should use the logger utility (`src/shared/utils/logger.ts` or `src/desk/core/logger.ts`). The `region-health-monitor.ts` is the most concerning -- 7 bare console calls in a health monitoring service that runs continuously. Failover events logged via `console.log` instead of a structured logger will be invisible to observability pipelines.

---

## Structural Issues

### Typo in directory name: `caculation`
The path `src/api/v1/risk/caculation/` is misspelled (should be `calculation`). This affects 11 files and will propagate to any import paths referencing this module. Not a runtime bug but a permanent code smell.

**Affected files:**
- `src/api/v1/risk/caculation/controller.ts`
- `src/api/v1/risk/caculation/handler.ts`
- `src/api/v1/risk/caculation/service.ts`
- `src/api/v1/risk/caculation/repository.ts`
- `src/api/v1/risk/caculation/types.ts`
- `src/api/v1/risk/caculation/error-handler.ts`
- `src/api/v1/risk/caculation/limit-enforcer.ts`
- `src/api/v1/risk/caculation/index.ts`
- `src/api/v1/risk/caculation/middleware/rightsGuard.ts`

### Dead imports / orphan code
259 unused variable/import warnings indicate significant accumulated dead code. The heaviest concentration is in `src/platform/api/routes/` where entire routers are imported but never mounted or used (e.g., `marketplaceStrategyRouter`, `marketplaceSubscriptionRouter`, `marketplaceSubscriptionStatsRouter`, `marketplaceSubscriptionEnhancementsRouter`).

---

## Recommendations

### P0 -- Blocking (should fix before ship)

None identified. Build passes, no lint errors, no banned imports.

### P1 -- High Priority (fix before production traffic)

1. **Replace 16 bare `console.*` calls in production services with logger.** Priority files:
   - `src/regions/region-health-monitor.ts` (7 calls -- health/failover events)
   - `src/queues/agent-coordinator.ts` (2 calls -- job failure logging)
   - `src/platform/jobs/trial-drip-runner.ts` (2 calls -- job execution)
   - `src/shared/utils/compression-stream.ts` (4 calls -- error handling)
   - `src/shared/utils/memory-pool.ts` (1 call -- error handling)

2. **Address `strategy-registry-full.ts` `as any` casts.** 24 strategy configs all cast via `as any` defeats the purpose of the type system. Define a proper `StrategyConfigMap` type or use a discriminated union for strategy configs.

3. **Type the Durable Object `env` parameter in `src/desk/strategies/router.ts`.** `env: any` allows arbitrary property access on the environment binding, which is a trust-boundary concern -- any typo in an env var name compiles without error but fails silently at runtime.

### P2 -- Medium Priority (fix in cleanup sprint)

4. **Convert 18 `require()` imports to ES module `import` statements.** These bypass TypeScript module resolution. Files: `handler.ts` (risk calculation), `sentry-init.ts`, `tracing.ts`, `agent-coordinator.ts`, `compression-stream.ts`.

5. **Fix `caculation` directory typo.** Rename `src/api/v1/risk/caculation/` to `src/api/v1/risk/calculation/` and update all imports. Better now than after external consumers depend on the path.

6. **Type `outlier-detection.ts` return values.** All three detection methods return `any`. Define proper return interfaces (`PriceOutlier`, `VolumeOutlier`, `PriceGap`).

7. **Clean up 259 unused imports/vars.** Focus on the route files in `src/platform/api/routes/` where entire routers are dead code. The remaining are mostly type imports and single variables.

### P3 -- Low Priority

8. **Address `src/desk/market-data/quality-monitoring-integration.ts` double-cast.** `(providerName as any as MarketDataSource)` hides a validation gap -- use a runtime check or Zod parse instead.

9. **Add `no-console` ESLint rule** for `src/regions/`, `src/queues/`, `src/platform/jobs/`, and `src/shared/utils/` to prevent future regressions.

---

## Metrics

| Metric | Value |
|---|---|
| TypeScript errors | 0 |
| TypeScript strict mode | Enabled |
| Lint errors | 0 |
| Lint warnings | 288 |
| `any` in production code | 339 |
| `any` in test code | 336 |
| Total `any` | 675 |
| Console in prod (non-CLI) | 16 |
| Banned imports | 0 |
| Total TS files | 1,090 |
| Test files | 273 |

---

## Positive Observations

- TypeScript compiles cleanly with `strict: true` enabled.
- Zero lint errors -- all 288 warnings are non-blocking.
- Banned import paths are fully avoided.
- Logger utility exists and is well-established in the codebase -- the console usage is an inconsistency, not a missing capability.
- Test file count (273) suggests reasonable coverage infrastructure.

---

## Unresolved Questions

1. **Test suite run:** `npm test` was invoked but output was truncated before final result. Full test pass/fail status should be verified separately.
2. **The `as any` in `strategy-registry-full.ts` (24 casts):** Is this intentional for a plugin/registry pattern where strategy configs are intentionally loose? If so, a wrapper type with runtime validation would be safer than bare `as any`.
3. **`require()` in `sentry-init.ts` and `tracing.ts`:** These may be intentional for conditional/lazy loading. Confirm whether this is a Cloudflare Workers compatibility pattern before converting to `import`.

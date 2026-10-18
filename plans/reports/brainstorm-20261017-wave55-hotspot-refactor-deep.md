# Brainstorm Report (`--deep`) — Wave 55 Hotspot Modularization (`178 LOC` Boundary → `<= 177 LOC`)

## 1. Brainstorm Contract
- **Outcome:** Refactor all 15 files currently at the `178 LOC` ceiling across `src/shared/`, `src/platform/`, `src/durable-objects/`, `src/desk/`, and `src/alpha-lab/` so that **0 files in `src/` exceed `177 LOC`** (each refactored target file `<= 165 LOC`).
- **Constraints:**
  - Preserve 100% public exports, Express routes, Durable Object endpoints, quantitative estimation formulas, and test assertions.
  - Zero `:any` types (`coupon-validate.test.ts` `as any` replaced with typed mock `KVNamespace`), zero `console.log` in production code, zero new `eslint-disable` comments.
  - Protected flows (Setup Wizard, `@Sophia_Bbot` Telegram commands, NOWPayments/PayOS IPN webhooks) remain untouched.
- **Non-goals:** Changing rate-limiter sliding-window logic, coupon pricing tiers, circuit breaker state machine transitions, or Engle-Russell ACD(1,1) QMLE math.
- **Acceptance Criteria:**
  1. All 15 target files reduced below `177 LOC`.
  2. Global `src/` max file size `<= 177 LOC` (`Total files > 177 LOC: 0`).
  3. `npm run typecheck` passes with 0 errors.
  4. All affected Vitest suites pass 100%.

## 2. Target Inventory (15 Files at `178 LOC`)
1. `src/shared/utils/memory-pressure-handler.ts` (178 LOC)
2. `src/shared/middleware/rate-limiter.ts` (178 LOC)
3. `src/platform/workers/__tests__/coupon-validate.test.ts` (178 LOC)
4. `src/platform/audit/__tests__/immutable-trade-audit.test.ts` (178 LOC)
5. `src/platform/api/routes/coupon-routes.ts` (178 LOC)
6. `src/durable-objects/strategy-shard.ts` (178 LOC)
7. `src/desk/strategies/polymarket/__tests__/delta-neutral-volatility-arbitrage.test.ts` (178 LOC)
8. `src/desk/risk/circuit-breaker.ts` (178 LOC)
9. `src/desk/feeds/feed-freshness-watchdog.ts` (178 LOC)
10. `src/desk/englerussell/engle-russell-estimator.ts` (178 LOC)
11. `src/desk/daemon/desk-daemon.ts` (178 LOC)
12. `src/alpha-lab/run-experiment.ts` (178 LOC)
13. `src/alpha-lab/pipeline/alpha-lab-pipeline-promoter.ts` (178 LOC)
14. `src/alpha-lab/pipeline/alpha-lab-pipeline-delegator.ts` (178 LOC)
15. `src/alpha-lab/experiments/experiment-engine.ts` (178 LOC)

## 3. Unresolved Questions
- None.

# Brainstorm & Execution Report: Wave 60 Hotspot Modularization (`<= 166 LOC` Ceiling)

- **Date:** 2026-10-18
- **Mode:** `--deep` (`ak-bootstrap` -> `ak-brainstorm`)
- **Status:** COMPLETED & VERIFIED (`Total files > 166 LOC: 0`, `tsc --noEmit` 0 errors, 12/12 targeted test suites / 111 tests passing)
- **Scope:** All 23 remaining `169 LOC` (1 file), `168 LOC` (14 files), and `167 LOC` (8 files) hotspots in `src/`

## 1. Brainstorm Contract

- **Outcome:** Lower the global `src/` file size ceiling from `169 LOC` down to `<= 166 LOC` (`Total files > 166 LOC: 0`) by modularizing/compacting all 23 files at `167–169 LOC` with 100% backward compatibility.
- **Constraints:**
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments (`eslint-suppressions.json` freeze).
  - Preserve all public exports, function signatures, class methods, and test coverage.
  - Protected flows (Setup Wizard, `@Sophia_Bbot` Telegram commands, NOWPayments/PayOS IPN webhooks) untouched or 100% behavior-preserved.
- **Non-goals:** Changing business logic, altering API schemas, or modifying external behavior.
- **Acceptance Criteria:**
  - `python3` line count check across `src/**/*.ts` returns `0` files `> 166 LOC` (Verified: `0`).
  - `npm run typecheck` passes with 0 errors (Verified: `0 errors`).
  - All Vitest suites covering the refactored files pass 100% (Verified: `12/12 suites`, `111/111 tests green`).

## 2. Refactored Files (`167–169 LOC` -> `<= 166 LOC`)

1. `src/desk/strategies/polymarket/__tests__/market-maker-class.test.ts` (169 -> 133 LOC)
2. `src/shared/utils/memory-pressure-handler.ts` (168 -> 162 LOC)
3. `src/platform/api/routes/webhooks/handlers/__tests__/signals-payment-handler.test.ts` (168 -> 148 LOC)
4. `src/lib/llm-router.ts` (168 -> 150 LOC)
5. `src/desk/tests/exchange-connection-test.ts` (168 -> 161 LOC)
6. `src/desk/risk/circuit-breaker.ts` (168 -> 165 LOC)
7. `src/desk/risk/__tests__/strategy-executor-paper-to-live.test.ts` (168 -> 156 LOC)
8. `src/desk/polymarket/__tests__/strategy-runner-types.test.ts` (168 -> 145 LOC)
9. `src/desk/execution/twap-executor-class.ts` (168 -> 164 LOC)
10. `src/desk/data/multi-venue-market-streamer.ts` (168 -> 163 LOC)
11. `src/desk/daemon/desk-daemon.ts` (168 -> 166 LOC)
12. `src/desk/cli/agent-dispatcher.ts` (168 -> 161 LOC)
13. `src/desk/amm/arbitrage/compensatory-unwind-handler.ts` (168 -> 161 LOC)
14. `src/alpha-lab/provenance/__tests__/verdict-summary.test.ts` (168 -> 149 LOC)
15. `src/alpha-lab/provenance/__tests__/run-card.test.ts` (168 -> 146 LOC)
16. `src/platform/api/routes/marketplace-strategy-listings-routes.ts` (167 -> 154 LOC)
17. `src/platform/api/routes/admin.ts` (167 -> 151 LOC)
18. `src/desk/strategies/dna/indicators-trend.ts` (167 -> 145 LOC)
19. `src/desk/ml/meta-ensemble/adaptive-fusion.ts` (167 -> 141 LOC)
20. `src/desk/marl/microstructure/kyle-lambda-calculator.ts` (167 -> 163 LOC)
21. `src/desk/marl/hedging/hedge-execution-handler.ts` (167 -> 125 LOC)
22. `src/desk/intelligence/co-pilot/__tests__/intent-classifier.test.ts` (167 -> 82 LOC)
23. `src/desk/feeds/websocket-client.ts` (167 -> 133 LOC)
24. `src/desk/backtesting/backtest-runner-simulation.ts` (widened `entry.defaultConfig` type to `unknown` for strict `StrategyEntry` compatibility)

## 3. Unresolved Questions
- None.

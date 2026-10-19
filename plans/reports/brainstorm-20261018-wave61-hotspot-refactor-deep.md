# Brainstorm Report: Wave 61 Hotspot Modularization (`163–164 LOC` -> `<= 162 LOC`)

**Date:** 2026-10-18
**Mode:** `/ak-brainstorm --deep`
**Scope:** All 23 remaining files in `src/` at `163–164 LOC`

## 1. Brainstorm Contract

- **Outcome:** Decompose and streamline all 23 remaining `163–164 LOC` files in `src/` so that `Total files > 162 LOC: 0` across the entire `src/` tree, with 0 TypeScript errors and 100% passing tests.
- **Constraints:**
  - Strict backward compatibility on all public exports, function signatures, and route handlers.
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments.
  - Protected flows (Setup Wizard, Telegram Bot, NOWPayments/PayOS IPN webhooks) untouched.
- **Non-goals:** Changing external API contracts, database schemas, or trading strategy math.
- **Acceptance Criteria:**
  - `find src -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l` reports 0 files `> 162 LOC`.
  - `npm run typecheck` exits 0.
  - All Vitest suites covering modified files pass 100%.

## 2. Target Files (23 Files)

1. `src/shared/rate-limit/__tests__/memory-fallback.test.ts` (164 -> 122 LOC)
2. `src/desk/strategies/polymarket/multi-leg-hedge-exits.ts` (164 -> 154 LOC)
3. `src/desk/polymarket/orderbook-stream.ts` (164 -> 110 LOC)
4. `src/shared/utils/__tests__/tracing.test.ts` (163 -> 115 LOC)
5. `src/shared/middleware/prometheus-metrics-core-signals.ts` (163 -> 133 LOC)
6. `src/platform/marketplace/repositories/performance-repository.ts` (163 -> 154 LOC)
7. `src/platform/billing/license-service.ts` (163 -> 160 LOC)
8. `src/platform/api/routes/admin-marketplace-strategy-vetting-routes.ts` (163 -> 141 LOC)
9. `src/platform/api/routes/__tests__/marketplace-strategy-listings-routes.test.ts` (163 -> 137 LOC)
10. `src/desk/structured/barrier-option-pricer.ts` (163 -> 122 LOC)
11. `src/desk/strategies/polymarket/__tests__/negative-risk-exit.test.ts` (163 -> 143 LOC)
12. `src/desk/strategies/GruStrategy.test.ts` (163 -> 154 LOC)
13. `src/desk/marl/environment/market-replay-engine.ts` (163 -> <=155 LOC)
14. `src/desk/market-data/types.ts` (163 -> <=140 LOC)
15. `src/desk/feeds/polymarket-websocket-feed.ts` (163 -> <=155 LOC)
16. `src/desk/feeds/__tests__/ws-heartbeat.test.ts` (163 -> <=150 LOC)
17. `src/desk/carrmadan/carr-madan-static-math.ts` (163 -> <=145 LOC)
18. `src/desk/arbitrage/trading-loop.ts` (163 -> <=155 LOC)
19. `src/desk/arbitrage/telemetry/arbitrage-audit-logger.ts` (163 -> <=145 LOC)
20. `src/desk/arbitrage/spread-detector.ts` (163 -> <=150 LOC)
21. `src/desk/arbitrage/risk/arbitrage-risk-guard-sizing.ts` (163 -> <=150 LOC)
22. `src/desk/arbitrage/profitability/profitability-types.ts` (163 -> <=150 LOC)
23. `src/alpha-lab/labeling/__tests__/triple-barrier.test.ts` (163 -> <=155 LOC)

## Unresolved Questions

- None.

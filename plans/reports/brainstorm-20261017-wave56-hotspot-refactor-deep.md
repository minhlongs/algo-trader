# Wave 56 Deep Brainstorm — Hotspot Modularization (`177 LOC` & `176 LOC` -> `<= 175 LOC`)

**Date:** 2026-10-18
**Mode:** `--deep` (`/ak-brainstorm` via `/ak-bootstrap`)
**Scope:** All 26 files at `177 LOC` (9 files) and `176 LOC` (17 files) in `src/`

---

## 1. Bounded Delivery Contract

- **Outcome:** Lower the global `src/` file size ceiling from `177 LOC` down to `<= 175 LOC` across the entire `algo-trader` repository by modularizing and streamlining all 26 files currently at `177 LOC` and `176 LOC`.
- **Constraints:**
  - Every file in `src/` must be strictly `<= 175 LOC` (`Total files > 175 LOC: 0`).
  - 100% backward compatibility on all exported classes, functions, constants, types, and test assertions.
  - Zero `:any` types, zero `console.log` in production code, and zero new `eslint-disable` comments.
  - Preserve Protected Flows (Setup Wizard, `@Sophia_Bbot` Telegram Bot, NOWPayments + PayOS IPN payment flow).
- **Non-Goals:** Changing business logic, altering risk/gate formulas, or modifying test coverage semantics.
- **Acceptance Criteria:**
  - `find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1 > 175 && $2 != "total"'` returns `0` files.
  - `npm run typecheck` passes with `0` errors.
  - `npx vitest run` passes across all affected test suites.

---

## 2. Target Inventory (26 Files: 9 at `177 LOC`, 17 at `176 LOC`)

1. `src/redis/__tests__/trade-stream.test.ts` (177 -> <= 165 LOC)
2. `src/platform/billing/usage-metering.ts` (177 -> <= 165 LOC)
3. `src/platform/billing/revenue-analytics.ts` (177 -> <= 165 LOC)
4. `src/desk/wiring/strategy-wiring.ts` (177 -> <= 165 LOC)
5. `src/desk/strategies/polymarket/twap-accumulator-strategy.ts` (177 -> <= 165 LOC)
6. `src/desk/strategies/polymarket/info-asymmetry-scanner-v2.ts` (177 -> <= 165 LOC)
7. `src/desk/data/multi-venue-market-streamer.ts` (177 -> <= 165 LOC)
8. `src/desk/commands/gru-strategy.ts` (177 -> <= 165 LOC)
9. `src/desk/cli/agent-dispatcher.ts` (177 -> <= 165 LOC)
10. `src/platform/risk/risk-engine.ts` (176 -> <= 165 LOC)
11. `src/platform/referral/__tests__/cookie-attribution.test.ts` (176 -> <= 165 LOC)
12. `src/platform/marketplace/services/__tests__/marketplace-execution-bridge.test.ts` (176 -> <= 165 LOC)
13. `src/platform/dashboard/paper-trading-pnl-tracker.ts` (176 -> <= 165 LOC)
14. `src/platform/api/routes/marketplace-provider-routes.ts` (176 -> <= 165 LOC)
15. `src/forest/rate-limit/__tests__/redis-rate-limiter-window.test.ts` (176 -> <= 165 LOC)
16. `src/durable-objects/shard-coordinator.ts` (176 -> <= 165 LOC)
17. `src/durable-objects/__tests__/shard-manager-routing.test.ts` (176 -> <= 165 LOC)
18. `src/desk/strategies/__tests__/kronos-strategy.test.ts` (176 -> <= 165 LOC)
19. `src/desk/paper-trading/paper-trading-loop.ts` (176 -> <= 165 LOC)
20. `src/desk/opencoresaas2026monetization/catalog-phases-1-to-3.ts` (176 -> <= 165 LOC)
21. `src/desk/marl/hedging/hedge-compensatory-unwind.ts` (176 -> <= 165 LOC)
22. `src/desk/execution/twap-executor-class.ts` (176 -> <= 165 LOC)
23. `src/desk/execution/polymarket-terminal-cache.ts` (176 -> <= 165 LOC)
24. `src/desk/arbitrage/trading-loop.ts` (176 -> <= 165 LOC)
25. `src/desk/arbitrage/risk/arbitrage-risk-guard.ts` (176 -> <= 165 LOC)
26. `src/desk/amm/pool/multi-token-pool.ts` (176 -> <= 165 LOC)

---

## 3. Unresolved Questions

None — all 26 targets are clear, bounded, and ready for immediate refactoring and verification.

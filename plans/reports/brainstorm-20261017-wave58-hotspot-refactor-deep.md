# Wave 58 Deep Brainstorm — Hotspot Modularization (`173 LOC` & `172 LOC` -> `<= 171 LOC`)

**Date:** 2026-10-18
**Mode:** `--deep` (`/ak-brainstorm` via `/ak-bootstrap`)
**Scope:** All 25 files at `173 LOC` (12 files) and `172 LOC` (13 files) in `src/`

---

## 1. Bounded Delivery Contract

- **Outcome:** Lower the global `src/` file size ceiling from `173 LOC` down to `<= 171 LOC` across the entire `algo-trader` repository by modularizing and streamlining all 25 files currently at `173 LOC` and `172 LOC`.
- **Constraints:**
  - Every file in `src/` must be strictly `<= 171 LOC` (`Total files > 171 LOC: 0`).
  - 100% backward compatibility on all exported classes, functions, constants, types, and test assertions.
  - Zero `:any` types, zero `console.log` in production code, and zero new `eslint-disable` comments.
  - Preserve Protected Flows (Setup Wizard, `@Sophia_Bbot` Telegram Bot, NOWPayments + PayOS IPN payment flow).
- **Non-Goals:** Changing business logic, altering risk/gate formulas, or modifying test coverage semantics.
- **Acceptance Criteria:**
  - `find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1 > 171 && $2 != "total"'` returns `0` files.
  - `npm run typecheck` passes with `0` errors.
  - `npx vitest run` passes across all affected test suites.

---

## 2. Target Inventory (25 Files: 12 at `173 LOC`, 13 at `172 LOC`)

1. `src/platform/marketplace/services/marketplace-execution-bridge.ts` (173 -> <= 160 LOC)
2. `src/platform/api/routes/arbitrage.ts` (173 -> <= 160 LOC)
3. `src/platform/ab-testing/__tests__/ab-test-manager.test.ts` (173 -> <= 160 LOC)
4. `src/desk/strategies/polymarket/entropy-scorer.ts` (173 -> <= 160 LOC)
5. `src/desk/strategies/grid-dca-strategy.ts` (173 -> <= 160 LOC)
6. `src/desk/risk/value-at-risk.ts` (173 -> <= 160 LOC)
7. `src/desk/intelligence/resolution-criteria-analyzer.ts` (173 -> <= 160 LOC)
8. `src/desk/intelligence/__tests__/logical-hedge-discovery.test.ts` (173 -> <= 160 LOC)
9. `src/desk/execution/order-executor.ts` (173 -> <= 160 LOC)
10. `src/desk/execution/live-execution-guard-core.ts` (173 -> <= 160 LOC)
11. `src/desk/backtesting/metrics-calculator.ts` (173 -> <= 160 LOC)
12. `src/desk/audit/__tests__/immutable-trade-audit.test.ts` (173 -> <= 160 LOC)
13. `src/platform/marketplace/repositories/backtest-repository.ts` (172 -> <= 160 LOC)
14. `src/desk/wiring/paper-trading-orchestrator.ts` (172 -> <= 160 LOC)
15. `src/desk/wiring/augmented-signal-pipeline.ts` (172 -> <= 160 LOC)
16. `src/desk/strategies/polymarket/microstructure-alpha.ts` (172 -> <= 160 LOC)
17. `src/desk/strategies/polymarket/liquidity-migration-v2.ts` (172 -> <= 160 LOC)
18. `src/desk/portfolio/erc-parity-solver.ts` (172 -> <= 160 LOC)
19. `src/desk/polymarket/__tests__/live-trading-strategy-executor.test.ts` (172 -> <= 160 LOC)
20. `src/desk/intelligence/__tests__/kronos-fair-value.test.ts` (172 -> <= 160 LOC)
21. `src/desk/data/multi-venue-market-streamer.ts` (172 -> <= 160 LOC)
22. `src/desk/daemon/desk-daemon.ts` (172 -> <= 160 LOC)
23. `src/desk/commands/paper-trading.ts` (172 -> <= 160 LOC)
24. `src/alpha-lab/__tests__/run-experiment-helpers.test.ts` (172 -> <= 160 LOC)
25. `src/alpha-lab/__tests__/experiment-configs.test.ts` (172 -> <= 160 LOC)

---

## 3. Unresolved Questions

None — all 25 targets are clear, bounded, and ready for immediate refactoring and verification.

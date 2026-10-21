# Brainstorm Report: Wave 62 Hotspot Modularization (`src/` 161 LOC Files -> <= 159 LOC)

**Date:** 2026-10-18
**Mode:** `/ak-bootstrap` -> `/ak-brainstorm --deep`

## 1. Brainstorm Contract

- **Outcome:** Eliminate all 21 remaining `160 wc / 161 totalLines` files in `src/` by extracting cohesive helper submodules or streamlining redundant boilerplate so the global `src/` ceiling drops to `<= 159 wc lines` (`<= 160 totalLines`).
- **Constraints:**
  - Preserve 100% of public exports, method signatures, and runtime behavior.
  - Zero `:any` types, zero `console.log` in production code, and zero new `eslint-disable` comments.
  - Protected flows (Setup Wizard, Telegram Bot `@Sophia_Bbot`, NOWPayments + PayOS IPN webhooks) remain untouched.
- **Non-goals:** Changing business logic, database schemas, or external API response contracts.
- **Acceptance Criteria:**
  - `0` files in `src/` with `> 159` wc lines (`> 160` total lines).
  - `npm run typecheck` passes with `0` errors.
  - All affected Vitest suites pass 100%.

## 2. Target Files (21 Files at 160 wc / 161 totalLines)

1. `src/api/routes/audit-routes.ts` (161 -> <= 145 LOC)
2. `src/desk/execution/__tests__/paper-execution-helpers.test.ts` (161 -> <= 148 LOC)
3. `src/desk/gate/__tests__/raas-gate-validators.test.ts` (161 -> <= 148 LOC)
4. `src/desk/orchestrator/synchronized-risk-gate.ts` (161 -> <= 145 LOC)
5. `src/desk/polymarket/live-trading-strategy-executor.ts` (161 -> <= 145 LOC)
6. `src/desk/realizedkernel/realized-kernel-engine.ts` (161 -> <= 145 LOC)
7. `src/desk/risk/__tests__/tiered-drawdown-load-deferred.test.ts` (161 -> <= 145 LOC)
8. `src/desk/sandbox/strategy-static-scanner.ts` (161 -> <= 145 LOC)
9. `src/desk/strategies/examples/__tests__/03-rsi-mean-reversion-strategy.test.ts` (161 -> <= 148 LOC)
10. `src/desk/strategies/polymarket/expiry-theta-decay.ts` (161 -> <= 145 LOC)
11. `src/desk/strategies/polymarket/price-impact-estimator-config.ts` (161 -> <= 145 LOC)
12. `src/desk/strategies/polymarket/volatility-targeting-v2.ts` (161 -> <= 145 LOC)
13. `src/desk/wiring/paper-trading-orchestrator.ts` (161 -> <= 148 LOC)
14. `src/platform/ab-testing/__tests__/ab-test-manager.test.ts` (161 -> <= 148 LOC)
15. `src/platform/ab-testing/ab-test-manager.ts` (161 -> <= 148 LOC)
16. `src/platform/api/routes/__tests__/referral-routes.test.ts` (161 -> <= 145 LOC)
17. `src/platform/api/routes/marketplace-subscription-enhancements.ts` (161 -> <= 145 LOC)
18. `src/platform/marketplace/repositories/subscription-repository.ts` (161 -> <= 148 LOC)
19. `src/platform/risk/__tests__/var-cvar-service.test.ts` (161 -> <= 145 LOC)
20. `src/platform/signal/signal-subscriber-repository-d1.ts` (161 -> <= 145 LOC)
21. `src/platform/telegram/trading-alerts.ts` (161 -> <= 145 LOC)

## 3. Unresolved Questions
- None.

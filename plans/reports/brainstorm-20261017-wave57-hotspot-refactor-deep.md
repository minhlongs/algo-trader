# Wave 57 Deep Brainstorm — Hotspot Modularization (`175 LOC` & `174 LOC` -> `<= 173 LOC`)

**Date:** 2026-10-18
**Mode:** `--deep` (`/ak-brainstorm` via `/ak-bootstrap`)
**Scope:** All 20 files at `175 LOC` (6 files) and `174 LOC` (14 files) in `src/`

---

## 1. Bounded Delivery Contract

- **Outcome:** Lower the global `src/` file size ceiling from `175 LOC` down to `<= 173 LOC` across the entire `algo-trader` repository by modularizing and streamlining all 20 files currently at `175 LOC` and `174 LOC`.
- **Constraints:**
  - Every file in `src/` must be strictly `<= 173 LOC` (`Total files > 173 LOC: 0`).
  - 100% backward compatibility on all exported classes, functions, constants, types, and test assertions.
  - Zero `:any` types, zero `console.log` in production code, and zero new `eslint-disable` comments.
  - Preserve Protected Flows (Setup Wizard, `@Sophia_Bbot` Telegram Bot, NOWPayments + PayOS IPN payment flow).
- **Non-Goals:** Changing business logic, altering risk/gate formulas, or modifying test coverage semantics.
- **Acceptance Criteria:**
  - `find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1 > 173 && $2 != "total"'` returns `0` files.
  - `npm run typecheck` passes with `0` errors.
  - `npx vitest run` passes across all affected test suites.

---

## 2. Target Inventory (20 Files: 6 at `175 LOC`, 14 at `174 LOC`)

1. `src/platform/billing/subscription-service.ts` (175 -> <= 165 LOC)
2. `src/desk/telemetry/portfolio-telemetry-hub.ts` (175 -> <= 165 LOC)
3. `src/desk/strategies/loader.ts` (175 -> <= 165 LOC)
4. `src/desk/polymarket/trading-pipeline.ts` (175 -> <= 165 LOC)
5. `src/desk/intelligence/vector-embedding-store.ts` (175 -> <= 165 LOC)
6. `src/desk/arbitrage/__tests__/integer-programming-solver.test.ts` (175 -> <= 165 LOC)
7. `src/shared/utils/__tests__/tracing.test.ts` (174 -> <= 165 LOC)
8. `src/shared/rate-limit/memory-fallback.ts` (174 -> <= 165 LOC)
9. `src/seed/security/audit-trail-queries.ts` (174 -> <= 165 LOC)
10. `src/platform/marketplace/notifications/notification-service.ts` (174 -> <= 165 LOC)
11. `src/platform/audit/__tests__/immutable-trade-audit.test.ts` (174 -> <= 165 LOC)
12. `src/platform/api/routes/marketplace-subscription-crud-handlers.ts` (174 -> <= 165 LOC)
13. `src/platform/ab-testing/ab-test-manager.ts` (174 -> <= 165 LOC)
14. `src/desk/trading-pipeline.ts` (174 -> <= 165 LOC)
15. `src/desk/strategies/polymarket/weighted-sentiment-aggregator-v2.ts` (174 -> <= 165 LOC)
16. `src/desk/signal/__tests__/signal-rest-cache.test.ts` (174 -> <= 165 LOC)
17. `src/desk/ml/model-registry.ts` (174 -> <= 165 LOC)
18. `src/desk/hasbrouck/hasbrouck-vecm-engine.ts` (174 -> <= 165 LOC)
19. `src/alpha-lab/reports/__tests__/hypothesis-rules-regime.test.ts` (174 -> <= 165 LOC)
20. `src/alpha-lab/attribution/alpha-survival-gate.ts` (174 -> <= 165 LOC)

---

## 3. Unresolved Questions

None — all 20 targets are clear, bounded, and ready for immediate refactoring and verification.

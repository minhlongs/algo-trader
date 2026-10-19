# Wave 53 Deep Brainstorm Report — Hotspot Modularization (`180 LOC` Boundary -> `<= 179 LOC`)

**Date:** 2026-10-17  
**Mode:** `/ak-bootstrap` -> `/ak-brainstorm --deep`  
**Scope:** All 5 remaining `180 LOC` files in `src/`

---

## 1. Opening Brainstorm Contract

- **Outcome:** Modularize and streamline all 5 files at `180 LOC` in `src/` so that **0 files in `src/` exceed `179 LOC`**, preserving 100% of public exports, CLI command registrations, risk circuit-breaker semantics, and test coverage.
- **Constraints:**
  - Every file in `src/` strictly `<= 179 LOC` (well below the 200 LOC threshold).
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments.
  - Protected flows untouched: Setup Wizard (`setup` command in `cli-builder.ts` preserved), Telegram Bot (`@Sophia_Bbot`), NOWPayments/PayOS IPN webhooks.
- **Non-goals:** Changing CLI flags, altering drawdown circuit-breaker thresholds, or modifying rebalance math.
- **Acceptance Criteria:**
  1. `0` files in `src/` exceed `179 LOC`.
  2. `npm run typecheck` passes with `0` errors.
  3. All Vitest suites for modified modules pass 100%.

---

## 2. 5-Turn Socratic Cross-Examination (`--deep`)

1. **Boundary Audit:** What is the exact maximum file length in `src/` after Wave 52?
   - Empirical scan confirms `180 LOC` is the maximum across all `.ts`/`.tsx` files in `src/`, held by 5 files (`cli-builder.ts`, `capital-readiness-tracker.ts`, `tiered-drawdown-breaker.ts`, `rebalance-engine.ts`, and `ab-test-manager.test.ts`).
2. **Decomposition Seam for `cli-builder.ts`:** How do we split `cli-builder.ts` without breaking `setup` (Protected Flow #1) or any CLI subcommand?
   - Keep `ArbAutoOptions`, `buildCliProgram`, and core onboarding/arb commands (`setup`, `quickstart`, `activate`, `arb:auto`) in `src/commands/cli-builder.ts` (~75 LOC), and extract the autonomous desk subcommands (`marl:auto`, `amm:auto`, `kronos`, `desk:auto`, `desk:status`, `idea:25`) into `src/commands/cli-desk-commands.ts` (~115 LOC).
3. **Risk & Strategy Preservation:** Do `tiered-drawdown-breaker.ts`, `capital-readiness-tracker.ts`, and `rebalance-engine.ts` change any runtime behavior?
   - No. All public interfaces, default configs, re-exports, and state transition branches remain bit-for-bit identical.
4. **Test Fidelity:** Does `ab-test-manager.test.ts` retain all 12 test cases?
   - Yes, all `describe` blocks and assertions remain identical.
5. **Verification Gate:** How is completion proven?
   - Python AST/line-count scan verifying `Total files > 179 LOC: 0`, `npm run typecheck` with 0 errors, and `npx vitest run` across all affected suites.

---

## 3. Target Matrix

| File | Before | After | Action |
|------|--------|-------|--------|
| `src/commands/cli-builder.ts` | 180 LOC | ~75 LOC | Extract desk subcommands to `cli-desk-commands.ts` |
| `src/commands/cli-desk-commands.ts` | — | ~115 LOC | New cohesive CLI registration helper |
| `src/desk/risk/tiered-drawdown-breaker.ts` | 180 LOC | ~145 LOC | Streamline tier evaluation dispatch |
| `src/desk/risk/capital-readiness-tracker.ts` | 180 LOC | ~135 LOC | Streamline readiness evaluation & JSDoc |
| `src/desk/strategies/polymarket/rebalance-engine.ts` | 180 LOC | ~138 LOC | Streamline delta rebalance trade finder |
| `src/platform/ab-testing/__tests__/ab-test-manager.test.ts` | 180 LOC | ~155 LOC | Streamline test setup while preserving all 12 tests |

---

## Unresolved Questions
- None.

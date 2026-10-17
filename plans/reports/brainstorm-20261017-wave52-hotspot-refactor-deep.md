# Wave 52 Hotspot Modularization (`--deep` Brainstorm Report)

**Date:** 2026-10-17
**Target Scope:** All remaining `185 LOC` TypeScript files in `src/` (lowering global `src/` ceiling to `<= 184 LOC`)

---

## 1. Opening Brainstorm Contract

- **Outcome:** Decompose and streamline all 9 `185 LOC` files in `src/` so every file in `src/` is strictly `<= 184 LOC` (and every touched file lands `<= 165 LOC`), with 100% backward-compatible exports, `0` TypeScript errors, and 100% green unit tests.
- **Constraints:**
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments (`eslint-suppressions.json` freeze).
  - Preserve Protected Flows (Setup Wizard, `@Sophia_Bbot` Telegram Bot, NOWPayments/PayOS IPN webhook).
  - Maintain exact public signatures, return shapes, and re-exports across all touched modules.
- **Non-goals:** Changing quantitative thresholds, slippage math, Kelly fraction formulas, or data quality gate invariants.
- **Acceptance Criteria:**
  1. `0` files in `src/` exceed `184 LOC` (`python3` walk scan across `src/`).
  2. `npm run typecheck` exits `0`.
  3. All Vitest suites covering the touched modules pass 100%.

---

## 2. 5-Turn Socratic Cross-Examination (`--deep`)

1. **Turn 1 — Seam Identification in Production Hotspots:**
   - *Question:* Where do `profitability-evaluator.ts`, `data-quality-gate.ts`, `live-trading-pipeline-orchestrator.ts`, `atomic-multileg-coordinator.ts`, `binary-arbitrage-executor.ts`, and `signal-provider-onboarding.ts` carry incidental verbosity vs. distinct sub-responsibilities?
   - *Evidence:*
     - `profitability-evaluator.ts` repeats identical zero-depth vs. VWAP vs. parametric slippage branching for buy and sell legs (`evaluateLegSlippage` helper eliminates 28 lines of duplication).
     - `data-quality-gate.ts` mixes per-candle invariant/timestamp/ATR-jump scanning with coverage calculation and report assembly.
     - `bench-http2.ts` mixes benchmark runner loops with ASCII table formatting (`formatBenchmarkReport`).
     - `live-trading-pipeline-orchestrator.ts`, `atomic-multileg-coordinator.ts`, `binary-arbitrage-executor.ts`, and `signal-provider-onboarding.ts` contain verbose multi-line object literals and unreachable-branch commentary that can be cleanly compacted while preserving 100% behavior.
2. **Turn 2 — Test Suite Fidelity:**
   - *Question:* Can `live-guard-handoff-challenge-gating.test.ts` (185 LOC) and `alpha-discover-handler.test.ts` (185 LOC) be tightened below 165 LOC without removing any test case or assertion?
   - *Evidence:* Yes — introducing a small `makeRequest` helper in `live-guard-handoff-challenge-gating.test.ts` and compacting mock setup in `alpha-discover-handler.test.ts` preserves all 7 and 8 `it(...)` blocks verbatim.
3. **Turn 3 — Blast Radius & Export Contracts:**
   - *Question:* Do any external callers import internal symbols from these 9 files?
   - *Evidence:* All public exports (`LiveTradingPipelineOrchestrator`, `runDataQualityGate`, `timeframeToMs`, `evaluateNetProfitabilityCore`, `BinaryArbitrageExecutor`, `BinaryExecutorConfig`, `AtomicMultiLegCoordinator`, `CoordinatorOptions`, `SignalProviderOnboarding`, `ProviderApplication`) remain exported from their original paths.
4. **Turn 4 — Risk & Edge Cases:**
   - *Question:* Could extracting `evaluateLegSlippage` in `profitability-evaluator.ts` alter `hasZeroDepth` or `insufficientLiquidity` flags?
   - *Evidence:* Returning `{ result: VwapSlippageResult; zeroDepth: boolean }` for each leg (`'buy'` checks `orderBook.asks`, `'sell'` checks `orderBook.bids`) preserves the exact boolean OR semantics (`hasZeroDepth = buyLeg.zeroDepth || sellLeg.zeroDepth`).
5. **Turn 5 — Verification Gate:**
   - *Decision:* Apply the modularizations across all 9 files, verify `Total files > 184 LOC: 0`, run `npm run typecheck`, and execute `npx vitest run` on all corresponding test suites.

---

## 3. Unresolved Questions

- None. All 9 files have deterministic boundaries and test coverage.

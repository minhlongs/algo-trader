# Phase-35 Regression Audit Report

Generated: 2026-08-02T01:29Z | Scope: 30 files / 113 failures | Suite stats: 3513 passed, 113 failed, 14 skipped across 306 test files.

---

## 1. How to Reproduce

From /Users/macbook/algo-trader, run:

    npx vitest run 2>&1 | tee /tmp/phase35-full.log
    # Expected: 113 FAIL lines, 5 unhandled ENOENT errors, ~61s duration, exit code 1

Category-specific reproductions:

**Signal-fusion-regime (signature: TypeError: adaptWeightsForRegime is not a function, also fuseSignals weight math mismatch)**
npx vitest run src/desk/intelligence/__tests__/signal-fusion-regime.test.ts
→ 11 failures: first 9 are TypeError on adaptWeightsForRegime. Final 2 are weight math mismatches (expected 0.243 got 0.15, expected 'DOWN' got 'NEUTRAL', expected 0.181 got 0.15).

Root cause: function never exported from signal-fusion-engine.ts. File has 158 lines and the function has not yet been defined in the implementation. Also the static math in the test expectations does not match the actual weights that would emerge from the fusion engine's clamping logic.

**Strategy-loader (signature: TypeError: StrategyLoader.getInstance is not a function, also getStrategyLoader and registerStrategy)**
npx vitest run src/desk/strategies/__tests__/loader.test.ts
→ 11 failures: StrategyLoader.getInstance is not a function, getStrategyLoader is not a function, loader.registerStrategy is not a function.

Root cause: the static config-driven registry exists (initializeRegistry populates 35 strategies), but no public API exports exist. No getInstance, no getStrategyLoader, no route handler that supplies them. Test imports a surface that was never built.

**Polymarket strategy runners (signature: AssertionError: expected 'running' to be 'stopped', plus 60s timeout)**
npx vitest run src/desk/polymarket/__tests__/
→ 3 failures: strategy-runner.test.ts line 130+ (AssertionError, expected running to be stopped), same line +36, and multi-strategy-runner.test.ts line 136 (60s timeout).

Root cause: strategy-runner.ts tick() does not transition state to 'stopped' after completing maxTicks, and the async fin

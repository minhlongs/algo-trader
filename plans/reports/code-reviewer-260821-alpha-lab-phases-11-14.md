# Code Review: Phase 11 (Alpha Discovery) & Phase 14 (Robustness)

**Date:** 2026-08-21
**Branch:** fix/migration-026-nested-aggregate
**Reviewer:** code-reviewer
**Scope:** 7 files, 890 LOC

## Verification Results

| Check | Result |
|-------|--------|
| `:any` types | PASS — zero found |
| `console.log` | PASS — zero found |
| Tests (`vitest`) | PASS — 29/29 |
| TypeScript (`tsc --noEmit`) | PASS — zero errors |
| File size (<200 LOC) | FAIL — `robustness-runner.ts` at 224 lines |
| Duplicate functionality | PASS — reuses `ExperimentConfig`, `runExperiment`, `generateMockCandles` |
| Safety (research-only) | PASS — mock candles, no live execution, no production changes |

## Critical Issues

None.

## High Priority

### H1. `robustness-runner.ts` exceeds 200-line limit (224 lines)

The file contains candle perturbation helpers, metric helpers, four individual perturbation runners, a scoring helper, and the main orchestrator. Split into two files:

- `src/alpha-lab/robustness/candle-perturbations.ts` — `lcg`, `dropCandles`, `delayCandles`, `getTestMetrics`
- `src/alpha-lab/robustness/robustness-runner.ts` — perturbation runners + `runRobustnessTest`

### H2. Dead `threshold` parameters on three runner functions

`runParameterPerturbation` (line 69), `runDelayStress` (line 124), and `runMissingDataStress` (line 148) each accept a `threshold: number` parameter but never reference it in their bodies. The actual scoring uses `DEFAULT_SHARPE_STABILITY_THRESHOLD` hardcoded in `countStable` (line 212). Either:

- **Option A (recommended):** Remove the `threshold` parameter from all three functions since `countStable` is the only consumer and it already imports the constant.
- **Option B:** Thread the threshold through to `countStable` if configurability is desired later.

Currently these are dead parameters that mislead readers into thinking per-dimension threshold control exists.

### H3. `stubMetrics` exported but never imported

`robustness-types.ts` line 91 exports `stubMetrics()` but no file in the codebase imports it. Dead code — remove the export or add a usage. If kept for future use, add a comment marking it as a planned utility.

### H4. Fee stress results excluded from overall score

`FeeStressResult` does not include `sharpeRatioDelta` (unlike the other three result types). Consequently, fee stress results are omitted from the `allDeltas` array on line 205-209 and do not contribute to `overallScore`. This means a strategy that collapses under 2x fees still scores 1.0 if all other dimensions are stable.

Either:
- Add `sharpeRatioDelta` to `FeeStressResult` and include it in the score calculation, or
- Document explicitly that fee stress is reporting-only and intentionally excluded from the composite score.

## Medium Priority

### M1. `experimentFromFamily` hardcoded fallback defaults

Lines 66-69 of `strategy-family-registry.ts`:

```typescript
tp: params.takeProfitBps ? params.takeProfitBps / 10_000 : 0.02,
sl: params.stopLossBps ? params.stopLossBps / 10_000 : 0.01,
maxHolding: params.maxHoldBars ?? params.exitLookback ?? 24,
lookback: params.breakoutLookback ?? params.atrLookback ?? 20,
```

This creates an implicit contract: families must define params named `takeProfitBps`, `stopLossBps`, `maxHoldBars`/`exitLookback`, and `breakoutLookback`/`atrLookback` — or the config silently falls back to hardcoded 0.02/0.01/24/20. Consider:

- Adding these mappings to the `StrategyFamily` type (e.g., `tpParam`, `slParam`, `lookbackParam`) so the factory is data-driven rather than relying on naming conventions.
- Or at minimum, documenting the expected param name conventions in the `StrategyFamily` interface JSDoc.

### M2. Unsafe property access in `runParameterPerturbation`

Line 73: `(config as unknown as Record<string, unknown>)[paramName]` — double cast to read arbitrary config properties. Works but fragile; a typo in `paramsToPerturb` silently produces `undefined` rather than a type error. Consider:

- Defining a set of known perturbable param names as a union type.
- Or at minimum adding a validation step that warns when `paramName` doesn't exist on the config.

### M3. `dropCandles` is probabilistic, not exact

`dropCandles` uses `rng() >= fraction` per candle, which gives approximately the target fraction but not exactly. For a 20% drop on 100 candles, the actual count varies. Acceptable for research/mock usage, but the test assertion `expect(result.length).toBeGreaterThan(50)` for a 20% drop is loose. This is fine for now but should be noted if exact drop counts become important.

### M4. Test file has `[rtk:grouped ×N]` annotations

`robustness-runner.test.ts` lines 76, 92, 130, 169 contain `[rtk:grouped ×2]` and `[rtk:grouped ×3]` annotations. These appear to be test runner formatting artifacts — they don't break tests but look like leftover tooling noise. Clean them up.

### M5. Source file has `[rtk:grouped ×3]` annotation

`robustness-runner.ts` line 69 has `[rtk:grouped ×3]` appended to a parameter declaration. Same cleanup needed.

## Low Priority

### L1. No integration with existing alpha-lab pipeline

Neither module is imported by any existing code outside their own `__tests__/` directories. This is acceptable for Phase 11/14 as research-only modules, but means there is no end-to-end validation that `experimentFromFamily` output actually works with `runExperiment` beyond the mock path. Consider adding one integration test that chains `experimentFromFamily` -> `runExperiment` with real-like candles.

### L2. `countStable` returns 0 when baselineSharpe is 0

Line 175: `if (baselineSharpe === 0) return 0;` — if the baseline Sharpe is exactly 0 (flat strategy), all perturbations are counted as unstable, producing score 0.0. This is arguably correct (a flat strategy is maximally fragile) but may confuse researchers. A comment explaining the rationale would help.

## Positive Observations

- Clean separation of types, definitions, and factory logic across Phase 11 files.
- Frozen configs (`Object.freeze`) prevent accidental mutation — good defensive practice.
- LCG-based `dropCandles` is deterministic and reproducible — essential for research.
- All perturbation runners use try/catch to gracefully skip invalid perturbations.
- Test coverage is solid: 27 tests across both modules covering happy paths, edge cases, determinism, and error handling.
- Proper reuse of `ExperimentConfig`, `runExperiment`, and `generateMockCandles` from existing modules.
- No live trading paths, no production execution changes — confirmed research-only.

## Recommended Actions

1. **Split `robustness-runner.ts`** into two files (H1)
2. **Remove dead `threshold` params** from three runner functions (H2)
3. **Remove or wire up `stubMetrics`** (H3)
4. **Decide on fee stress scoring** and either add `sharpeRatioDelta` or document exclusion (H4)
5. **Clean up `[rtk:grouped]` artifacts** in test and source files (M4, M5)
6. **Document param name conventions** for `experimentFromFamily` (M1)

## Metrics

- Type Coverage: 100% (no `:any`)
- Test Coverage: 29/29 passing
- Linting Issues: 0
- File Size Violations: 1 (`robustness-runner.ts` at 224 lines)
- Dead Code: 1 (`stubMetrics` export)
- Dead Parameters: 3 (`threshold` on runner functions)

## Unresolved Questions

1. Should fee stress results contribute to `overallScore`? Currently they are reporting-only.
2. Is `stubMetrics` planned for future use or accidental dead code?

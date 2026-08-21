# Code Review: Alpha Discovery Engine — Phases 8, 12, 16, 19

**Date:** 2026-08-21
**Branch:** fix/migration-026-nested-aggregate
**Files reviewed:** 16 new files

## Per-File Verdicts

| # | File | Lines | Verdict | Notes |
|---|------|-------|---------|-------|
| 1 | `src/alpha-lab/cost-model/cost-stress.ts` | 134 | **PASS** | Pure, frozen configs, JSDoc, no `:any`. |
| 2 | `src/alpha-lab/cost-model/__tests__/cost-stress.test.ts` | 177 | **PASS** | Real assertions, causality regression test. |
| 3 | `src/alpha-lab/reports/hypothesis-generator.ts` | 87 | **PASS** | Pure, deterministic, capped output. |
| 4 | `src/alpha-lab/reports/hypothesis-rules.ts` | 258 | **FAIL** | Exceeds 200-line limit; should split into 2+ files. |
| 5 | `src/alpha-lab/reports/__tests__/hypothesis-generator.test.ts` | 219 | **PASS** | Real logic, determinism test, edge cases. |
| 6 | `src/desk/cli/alpha-commands.ts` | 150 | **PASS** | Clean delegation, consistent pattern. |
| 7 | `src/desk/cli/alpha-backtest-handler.ts` | 85 | **PASS** | No issues found. |
| 8 | `src/desk/cli/alpha-discover-handler.ts` | 92 | **FAIL** | Line 34: `&&` should be `\|\|` — logic bug filters wrong. |
| 9 | `src/desk/cli/alpha-candidates-handler.ts` | 42 | **PASS** | Clean, minimal. |
| 10 | `src/desk/cli/alpha-compare-handler.ts` | 75 | **PASS** | No issues found. |
| 11 | `src/desk/cli/alpha-report-handler.ts` | 115 | **PASS** | Heavy but functional; dynamic imports reasonable. |
| 12 | `src/desk/cli/alpha-ablation-handler.ts` | 107 | **PASS** | No issues found. |
| 13 | `src/desk/cli/alpha-robustness-handler.ts` | 108 | **PASS** | Graceful fallback when cost-model missing. |
| 14 | `src/desk/cli/alpha-walkforward-handler.ts` | 60 | **PASS** | No issues found. |
| 15 | `src/desk/cli/__tests__/alpha-cli.test.ts` | 278 | **FAIL** | Line 160: uses `@shared/utils/logger` alias (JS not TS path). |
| 16 | `src/desk/cli/cashclaw-cli.ts` | 273 | **PASS** | Alpha additions at end are clean; existing logic untouched. |

## HIGH-Severity Findings

1. **BUG: `alpha-discover-handler.ts:34` — filter logic inverted**
   ```typescript
   // WRONG: only skips when BOTH mismatch — passes configs with wrong symbol OR wrong timeframe
   if (config.symbol !== symbol && config.timeframe !== opts.tf) continue;
   // CORRECT:
   if (config.symbol !== symbol || config.timeframe !== opts.tf) continue;
   ```
   Impact: runs experiments against wrong symbols/timeframes, producing meaningless results.

2. **BUG: `alpha-discover-handler.ts:59` — fake profitFactor**
   ```typescript
   profitFactor: testMetrics.totalPnl > 0 ? 999 : 0,
   ```
   This returns a sentinel value, not an actual metric. Downstream consumers or JSON exports will report a misleading profit factor. Should either compute from `runExperiment` result metrics or omit the field.

## MEDIUM-Severity Findings

3. **`hypothesis-rules.ts` — 258 lines, exceeds 200-line limit.**
   Contains 8 detection rules (a-h). Split into `hypothesis-rules-regime.ts`, `hypothesis-rules-risk.ts`, and `hypothesis-rules-quality.ts`, or group by concern.

4. **`alpha-cli.test.ts:160` — `@shared/utils/logger` import uses path alias.**
   All other mocks use relative paths (`../../../shared/utils/logger`). The alias import may fail in vitest if not all alias entries are configured. Use the same relative path as line 95.

## LOW-Severity Findings

5. **`hypothesis-rules.ts:176` — `reduce` on non-empty array without type guard.**
   `nonHigh.reduce((a, b) => ...)` assumes `nonHigh` is non-empty. The guard `buckets.length < 2` on line 169 ensures at least one non-high bucket when `high` exists, but a defensive check or non-null assertion comment would clarify intent.

## Overall Verdict

**FAIL** — 2 high-severity logic bugs in `alpha-discover-handler.ts` (filter condition and fake profitFactor), plus 1 medium file-size violation.

### Positive Observations
- Cost-stress module is well-structured: pure, frozen configs, thorough tests with causality regression.
- Hypothesis generator is deterministic (tested), capped, and properly filters duplicates.
- CLI handlers follow consistent pattern: load config, run engine, format output.
- No `:any` types, no `console.log`, no `Math.random()` or `Date.now()` anywhere.
- Graceful error handling in robustness handler (lazy import fallback).

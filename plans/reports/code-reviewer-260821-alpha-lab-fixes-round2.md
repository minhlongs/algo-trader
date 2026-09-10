# Code Review Round 2: Alpha-Lab Fix Verification

**Date:** 2026-08-21
**Branch:** fix/migration-026-nested-aggregate
**Reviewer:** code-reviewer agent
**Scope:** Verify 4 fixes from prior review (plans/reports/code-reviewer-260821-alpha-lab-phases-8-12-16-19.md)

## Fixes Under Review

| # | Prior Finding | Severity | File | Fix Applied |
|---|---------------|----------|------|-------------|
| 1 | Filter logic inverted (`&&` should be `\|\|`) | HIGH | `src/desk/cli/alpha-discover-handler.ts:34` | Changed to `\|\|` |
| 2 | Fake `profitFactor: testMetrics.totalPnl > 0 ? 999 : 0` sentinel | HIGH | `src/desk/cli/alpha-discover-handler.ts:59` | Field removed from `DiscoverResult` interface and `results.push` object |
| 3 | `hypothesis-rules.ts` 258 lines (exceeds 200-line limit) | MEDIUM | `src/alpha-lab/reports/hypothesis-rules.ts` | Split into `hypothesis-rules-risk.ts` (118 lines) + `hypothesis-rules-regime.ts` (151 lines) + 7-line barrel re-export |
| 4 | `@shared/utils/logger` alias import in test (line 160) | MEDIUM | `src/desk/cli/__tests__/alpha-cli.test.ts:160` | Changed to `../../../shared/utils/logger` relative path |

## Per-Fix Verification

### Fix 1 — Filter Logic (`alpha-discover-handler.ts:33`)

**Status: CORRECT**

```typescript
if (config.symbol !== symbol || config.timeframe !== opts.tf) continue;
```

The `||` correctly skips when either symbol OR timeframe mismatches. Previously `&&` only skipped when BOTH mismatched, allowing wrong-symbol/wrong-timeframe configs to run. This was a real logic bug that would produce meaningless results.

**Edge case check:** The condition is a single `continue` statement with no side effects before it. The `for...of` loop iterates all configs and filters correctly. No regression risk.

### Fix 2 — Removed Fake `profitFactor` Sentinel

**Status: CORRECT**

- `DiscoverResult` interface no longer contains `profitFactor` (verified: 7 fields, all real metrics).
- `results.push` object no longer contains `profitFactor`.
- Broad grep across `src/` confirms no leftover references to `profitFactor` in the discover handler or its test file.
- The `printTable` columns (`['Experiment', 'Sharpe', 'Win%', 'PnL', 'Survival']`) match the remaining interface fields exactly.

**Edge case check:** `writeOutput` serializes `results` to JSON — no fake sentinel values will leak into exports. Downstream consumers that previously read `profitFactor` from discover results would get `undefined`, which is correct behavior (the field was never real).

### Fix 3 — File Split (`hypothesis-rules.ts`)

**Status: CORRECT**

| File | Lines | Under 200? |
|------|-------|------------|
| `hypothesis-rules.ts` (barrel) | 10 | Yes |
| `hypothesis-rules-risk.ts` | 118 | Yes |
| `hypothesis-rules-regime.ts` | 151 | Yes |

**Public API preservation:** The barrel re-exports all 8 functions:
- From risk: `detectStopLoss`, `detectDrawdown`, `detectProfitFactor`, `detectSmallSample`
- From regime: `detectRegimeFilter`, `detectSeasonality`, `detectVolatilityDegradation`, `detectOverfit`

The sole consumer (`hypothesis-generator.ts:12-21`) imports all 8 from `'./hypothesis-rules'` — unchanged import path, all symbols resolve.

**Rule grouping:** Rules grouped by concern (risk/position-sizing vs. regime/seasonality/quality), which is a cleaner separation than the original single file. Each split file is self-contained with its own constants and `clampConfidence` helper (small duplication of a 3-line function, acceptable at this size).

**Edge case check:** No circular imports. Both split files import from `./hypothesis-generator` (type only), `../evaluation/evaluation-types`, and `../attribution/alpha-evaluator` / `../baselines/baseline-runner` — all stable relative paths.

### Fix 4 — Import Path in Test

**Status: CORRECT**

```typescript
import { logger } from '../../../shared/utils/logger';
```

Matches the relative-path pattern used by all other mocks in the same file (lines 95, 105, 124, 139, 149). The `@shared` alias was inconsistent and could fail if vitest alias resolution wasn't configured.

## Build & Test Results

### `npx tsc --noEmit`
**PASS** — 0 errors, 0 warnings. No type errors introduced by any of the 4 fixes.

### `npx vitest run src/alpha-lab src/desk/cli`
**PASS** — 18 test files, 165 tests, all passing.

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| `src/alpha-lab` | 8 | 98 | PASS |
| `src/desk/cli` | 10 | 67 | PASS |

### Lint
No new lint violations detected. No `eslint-disable` comments added. No `:any` types introduced.

## Edge Cases Scouted

1. **Discover handler filter:** The `continue` is the first statement in the loop body. No config-dependent state is mutated before the filter, so skipping is safe.
2. **Barrel re-export consumers:** Only `hypothesis-generator.ts` imports from the barrel. Verified it imports all 8 symbols and they all resolve. No other file imports the split modules directly (would break if they did, but they don't).
3. **`profitFactor` in other modules:** `profitFactor` is a legitimate field in `src/desk/backtesting/types.ts`, `src/desk/strategies/paper-trading/paper-pnl-tracker.ts`, `src/execution/paper-position-tracker.ts`, etc. These are unrelated to the discover handler and remain valid. The fix only removed the fake sentinel from `DiscoverResult`, not the real metric elsewhere.
4. **Test mock consistency:** The test file's `runExperiment` mock returns `testMetrics` with `totalPnl`, `sharpeRatio`, `winRate` — all fields still consumed by the fixed handler. No mock field references broke.

## Verdict

**PASS — All 4 fixes are correct and complete.**

- Fix 1 (HIGH): Logic bug resolved; filter now correctly skips on either mismatch.
- Fix 2 (HIGH): Fake sentinel removed; `DiscoverResult` contains only real metrics.
- Fix 3 (MEDIUM): File split clean; all files under 200 lines; barrel preserves public API; tsc + tests pass.
- Fix 4 (MEDIUM): Import path fixed; consistent with rest of file.

**No regressions detected.** Business logic unchanged — the discover handler still computes the same metrics (`sharpe`, `totalPnl`, `winRate`, `survivalGate`, `dataSource`) and the hypothesis rules still detect the same 8 patterns with identical logic. The only behavioral change is that configs with mismatched symbol/timeframe are now correctly skipped (fix 1), and no fake `profitFactor: 999` is emitted (fix 2).

## Recommended Actions

None required. All fixes are verified. The branch is ready for merge.

### Metrics
- Type Coverage: 100% (tsc --noEmit clean)
- Test Coverage: 165/165 passing in scope
- Linting Issues: 0 new
- Files under 200-line limit: 5/5 verified

### Unresolved Questions
None.
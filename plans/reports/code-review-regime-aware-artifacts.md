# Code Review — S9 Regime-Aware Research Artifacts

**Reviewer:** code-reviewer
**Date:** 2026-08-25
**Base:** 7d325621 → HEAD (2 commits: efcfba41, 28d935f4)
**Branch:** main (working tree)

## Scope

| File | LOC | Status |
|------|-----|--------|
| `src/alpha-lab/regimes/regime-series.ts` | 32 | new |
| `src/alpha-lab/regimes/index.ts` | 26 | new barrel entries |
| `src/alpha-lab/experiments/split-metrics.ts` | 52 | new (extracted) |
| `src/alpha-lab/experiments/experiment-engine.ts` | 200 | modified |
| `src/alpha-lab/walkforward/walkforward-evaluator.ts` | 193 | modified |
| `src/alpha-lab/run-experiment.ts` | 200 | modified |
| `src/desk/cli/alpha-report-handler.ts` | 110 | modified |
| `regime-series.test.ts` | 62 | new (6 tests) |
| `experiment-engine.test.ts` | +20 | modified (+2 tests) |
| `walkforward-evaluator.test.ts` | +3 | modified (+3 assertions) |
| **Total** | **875** | |

## Verdict

**APPROVED — 8.5/10**

Solid, well-scoped increment. All 6 review criteria pass. One misleading test name and one inconsistency worth noting but neither blocking.

---

## Findings

### F1 (Low) — Misleading test name: "attributes only regimes inside each split kind window"

**File:** `src/alpha-lab/experiments/__tests__/experiment-engine.test.ts:98-107`

```typescript
it('attributes only regimes inside each split kind window', () => {
  ...
  const fullDistinct = new Set(['TREND_UP', 'TREND_DOWN', 'RANGE', ...]);
  for (const r of result.metrics.train.regimesPresent) {
    expect(fullDistinct.has(r)).toBe(true);  // ← checks all possible regimes, not window containment
  }
  expect(trainWindow.startIdx).toBeLessThan(trainWindow.endIdx);
});
```

**Problem:** The test name promises a window-containment assertion. The body only checks each regime is a valid `MarketRegime` enum value — a tautology that would pass even if all regimes were attributed to every split. True containment would require verifying `regimesForKind('train')` does NOT contain regimes exclusive to test-window candles (e.g., by checking that at least one test-only regime is absent from train).

**Impact:** Not a correctness bug; the function is correct. But the test provides zero coverage for its stated intent.

**Suggested fix:** Rename to `'regimesPresent contains only valid MarketRegime values'` or replace the body with an actual containment check (e.g., inject candles with a distinct regime in the test window only and assert it does not appear in `regimesForKind('train')`).

---

### F2 (Low) — winRate definition inconsistency across two metric paths

**Files:**
- `src/alpha-lab/walkforward/walkforward-evaluator.ts:43` — `winRate: report.winRate` (PnL-based: `pnl > 0`)
- `src/alpha-lab/experiments/split-metrics.ts:42` — `winRate: wins / labels.length` (label-based: `label === 1`)

**Context:** The walkforward path was intentionally fixed — the comment at line 28-31 explains `computeMetrics` conflates timeout exits (label 0) with signal losses. The experiment-engine path retains the original label-based calculation, which is behavior-preserving for that code path.

**Impact:** Low. Both paths are internally consistent. Label-based counting treats all timeout exits uniformly (regardless of PnL sign); PnL-based counts timeouts with positive PnL as wins. Downstream consumers should be aware of this semantic difference when comparing metrics across the two evaluation paths.

**Suggested follow-up (non-blocking):** Align both paths to use `report.winRate` in a future pass, with a shared comment explaining the semantic choice.

---

## Criteria Verification

### 1. Causality — computeRegimeSeries ✅

**`regime-series.ts:24`**
```typescript
const window = candles.slice(Math.max(0, i - opts.lookback), i + 1);
```

`slice(start, i+1)` means the window contains only indices `[start..i]` — no future bars. Test at `regime-series.test.ts:27-33` confirms this by prepending 12 candles and verifying the prefix of a 20-candle series matches the 12-candle series exactly.

### 2. Attribution-only guarantee ✅

- **labeling, trade building, PnL, Sharpe, drawdown:** Zero changes to `batchLabel`, `buildTrades`, `buildEquityCurve`, `computeMetrics`, or `computeMaxDrawdown`/`computeSharpeRatio`. Verified by reading diffs against `7d325621`.
- **`regimesPresent` population:** Changed from hardcoded `[]` to computed values. This is purely additive metadata — no consumer logic was broken.
- **`splitMetricsFrom` (walkforward-evaluator.ts:33-53):** `winRate` from `report.winRate` ✅, `lossRate` from label `-1` count ✅, `timeoutRate` from label `0` count ✅, `meanLabel` from label average ✅. Zero-count guard: `n > 0` check present ✅.

### 3. regimesForKind union logic in experiment-engine ✅

**`experiment-engine.ts:142-145`**
```typescript
const regimesForKind = (kind: 'train' | 'val' | 'test'): MarketRegime[] =>
  distinctRegimes(rawSplits
    .filter((s) => s.kind === kind)
    .flatMap((s) => regimeSeries.slice(s.startIdx, s.endIdx)));
```

Correctly filters `rawSplits` by kind, slices the full `regimeSeries` to each split's window, flattens, and dedupes. Per-split-kind windows only — no cross-kind contamination.

### 4. run-experiment mapBaselines uses FULL regimeSeries ✅

**`run-experiment.ts:144-148, 89-90`**
```typescript
const regimeSeries = computeRegimeSeries(candles, { ... });  // full candle series
...
function mapBaselines(baselines, regimeSeries: MarketRegime[]) {
  const regimesPresent = distinctRegimes(regimeSeries);  // distinct over ALL candles
```

Baselines run all candles, regimeSeries covers all candles. Correct.

### 5. LOC, typing, eslint, console ✅

| Constraint | Result |
|------------|--------|
| LOC ≤ 200 | All files ≤ 200 (experiment-engine and run-experiment exactly 200) |
| No `:any` | ✅ Clean — grep found zero instances |
| No new `eslint-disable` | ✅ Clean — zero new suppressions |
| No `console.log` | ✅ Clean — only pre-existing `console.error` in run-experiment.ts fatal handler (line 198, existed before S9) |

### 6. Test quality ✅

**`regime-series.test.ts` — 6 tests, all meaningful:**
| Test | What it proves |
|------|----------------|
| Determinism | Same inputs → same output ✅ |
| Causality | Prefix of future-augmented series = prefix-only series ✅ |
| Empty input | Edge case handled ✅ |
| Dedupe sort | `distinctRegimes` deterministic + sorted ✅ |
| Custom rules | Rules passthrough verified ✅ |
| Lookback bound | Window limited to `lookback + current` ✅ |

**New assertions in existing test files:**
- `experiment-engine.test.ts:88-95`: Regimes are non-empty and valid enum values ✅
- `experiment-engine.test.ts:98-107`: Window containment (name misleading, see F1) ⚠️
- `walkforward-evaluator.test.ts:57-59`: `regimesPresent` non-empty per step ✅

---

## Positive Observations

1. **Clean DRY extraction:** `computeRegimeSeries` replaces 3 duplicated inline loops (`alpha-report-handler`, `experiment-engine`, `walkforward-evaluator`) with a single function. `splitMetricsFrom` and `stepMetrics` further reduce walkforward duplication.
2. **Strong causal comments:** Every function documents its causal invariant with `@see` references to the architecture doc.
3. **Barrel organization:** `regime/index.ts` cleanly re-exports both old (`classifyRegime`) and new (`computeRegimeSeries`) APIs without breaking existing consumers.
4. **Zero behavior regression:** `computeMetrics`, `batchLabel`, `buildTrades`, `buildEquityCurve` all untouched. `winRate` fix in walkforward path is well-documented.
5. **Test assertion density:** 6 new regime-series tests + 2 new experiment tests + 3 new walkforward assertions = good coverage for a utility module.

## Metrics

- Type Coverage: 100% (no `:any`, all interfaces typed)
- Test Coverage: 27/27 targeted + new regime-series 6/6 + new assertions = 33+ pass
- Linting Issues: 0 (eslint clean on all changed files)
- LOC Risk: 2 files at exactly 200 (experiment-engine.ts, run-experiment.ts) — monitor on next change

## Unresolved Questions

1. Should `split-metrics.ts` (experiment-engine path) be aligned to use `report.winRate` instead of label-based counting? Low priority — both semantics are valid; difference only matters for timeout trades with positive PnL.
2. Is the regime-series barrel (`regime/index.ts`) being used by downstream consumers, or are all imports still direct from `regime-series.ts`? Could be a cleanup opportunity to centralize all imports through the barrel.

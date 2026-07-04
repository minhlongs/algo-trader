# Risk Module Tests & Roadmap Update — Implementation Report

**Date:** 2026-07-01
**Branch:** main
**Scope:** Unit tests for VaR/CVaR calculator and portfolio correlation matrix

## Files Created

### `src/desk/risk/__tests__/value-at-risk.test.ts`
15 tests across 6 describe blocks:
- `parametricVaR (95%)` — verifies VaR matches manual computation for 2-position portfolio
- `parametricVaR (99%)` — confirms higher VaR at 99% vs 95%, ratio ~z99/z95
- `historicalVaR` — verifies ~5th percentile from 100 samples; sqrt(horizon) scaling
- `CVaR` — historical CVaR > VaR (multi-element tail); parametric CVaR > VaR
- `edge cases` — empty positions (0 VaR), zero portfolio value, single position, <2 return periods
- `time horizon` — 10-day VaR ≈ sqrt(10) * 1-day VaR (parametric)
- `method='both'` — returns both parametric and historical results
- `calculateVaR integration` — weight derivation, method routing for CVaR type

### `src/desk/risk/__tests__/portfolio-correlation.test.ts`
18 tests across 5 describe blocks:
- `pearsonCorrelation` — perfect positive (+1.0), perfect negative (-1.0), zero-variance (NaN), <3 points (NaN), mismatched lengths
- `buildCorrelationMatrix` — 3x3 matrix, symbol filtering (<5 data points), <2 qualifying symbols
- `findHighlyCorrelated` — detects highly correlated pairs, skips low correlation, sorts by abs(r) descending, empty when threshold too high
- `diversificationScore` — near 1 for uncorrelated, 0 for perfectly correlated, 1 for single asset, 0 for empty
- `edge cases` — empty input, weak correlation classification, NaN handling in matrix

## Files Modified

### `docs/development-roadmap.md` (Phase 37)
- Marked 3 items as done: Portfolio correlation matrix, VaR (95%, 99%), CVaR
- Status changed from **PLANNED** to **IN PROGRESS**

## Quality Gates

| Gate | Result |
|------|--------|
| `npx vitest run src/desk/risk/__tests__/value-at-risk.test.ts src/desk/risk/__tests__/portfolio-correlation.test.ts` | 33/33 passed |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` (full suite) | 2503 passed / 2 pre-existing failures (auth env) |

## Notes

- Pre-existing failures (2): `api.test.ts` and `rate-limit.test.ts` — both fail with `BETTER_AUTH_SECRET must be set`. These are environment-dependent and unrelated to risk module.
- All tests use deterministic data — no mocking, no random, pure math verification.
- The `pearsonCorrelation` test for zero-variance series expects `NaN` (current code behavior). The `buildCorrelationMatrix` correctly filters symbols with <5 data points.

## Unresolved Questions

- None.

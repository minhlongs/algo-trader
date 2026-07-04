# Implementation Report: VaR + CVaR Calculator

**Date:** 2026-07-01
**Task:** Implement Value-at-Risk (VaR) and Conditional VaR (Expected Shortfall) for risk module
**Status:** Complete

## Files Changed

| File | Action |
|------|--------|
| `src/desk/risk/value-at-risk.ts` | Created (173 lines) |
| `src/desk/risk/index.ts` | Modified (added export) |

## What Was Implemented

### value-at-risk.ts

**Types exported:**
- `VaRConfig` — confidence (0.95 or 0.99), horizonDays, method (parametric/historical/both)
- `VaRResult` — parametricVaR, historicalVaR, cVaR, confidence, horizonDays, totalPortfolioValue
- `PositionPnlInput` — symbol, currentValue, returns[]

**Class: `ValueAtRiskCalculator` (static methods)**

| Method | Description |
|--------|-------------|
| `parametricVaR()` | Variance-covariance: pv * z * sigma * sqrt(t) |
| `historicalVaR()` | Sort returns, take (1-confidence) percentile, scale by sqrt(t) |
| `cVaRHistorical()` | Expected Shortfall: average of tail losses beyond VaR threshold |
| `cVaRParametric()` | Parametric CVaR: pv * (phi(z)/(1-alpha)) * sigma * sqrt(t) |

**Function: `calculateVaR()`**
- Main entry point accepting positions + config
- Computes weights from position currentValues / total portfolio value
- Computes portfolio-level returns as weighted sum of per-position daily returns
- Routes to parametric and/or historical methods based on config.method
- CVaR defaults to historical (non-parametric) for robustness; uses parametric only when method='parametric'

### Math Notes

- Z-scores: 95% = 1.645, 99% = 2.326
- Square-root-of-time rule for multi-day horizon scaling
- Sample standard deviation (n-1 denominator)
- Portfolio returns use min-series-length across positions to avoid misalignment
- Empty/invalid inputs return zero VaR with logger warning

## Verification

- `npx tsc --noEmit` -- 0 errors
- File size: 173 lines (under 200-line target)
- Pattern: matches kelly-position-sizer.ts (JSDoc, static methods, logger, clean interfaces)
- Barrel export added to `index.ts`

## Unresolved Questions

None. Ready for testing and integration.

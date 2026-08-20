# Alpha-Lab Quality Debt: Code-Reviewer Fixes 4-7

**Date:** 2026-08-16
**Severity:** Medium
**Component:** alpha-lab (PnL, equity curve, DRY extraction)
**Status:** Resolved

## What Happened

Applied fixes 4-7 from code-reviewer pass on alpha-lab quality debt. Four issues addressed: divergent PnL convention documentation, a near-zero-peak division bug in paper-trading equity curve, fabricated baseline metrics, and duplicate equity-curve/trade-builder logic across four consumers.

## The Brutal Truth

Fix 5 was the most dangerous — `check-gates.ts` equity curve started at 1.0 (fraction) while accumulating nominal-USD PnL. Near-zero peak meant `maxDrawdown` divided by a near-zero value, producing wildly inflated drawdown percentages. This could silently corrupt paper-trading gate evaluations if anyone relied on them.

Fix 6 was an integrity issue. The code fabricated `timeoutRate: 0` and `meanLabel: 0` for baselines that legitimately never produce those values. Honest omission beats lying with zeros.

## Technical Details

- **Fix 4**: Two PnL conventions coexist — alpha-lab path returns return-on-capital fraction (equity curve starts at 1.0), polymarket/backtest-runner path uses nominal USD starting at `initialCapitalUsd`. Documented in `MetricsReport.totalPnl` JSDoc.
- **Fix 5**: `check-gates.ts` equity curve now starts at `PAPER_INITIAL_CAPITAL_USD = 10_000` and accumulates nominal-USD PnL, matching `src/shared/backtesting/backtest-runner.ts`. Fixes near-zero-peak maxDrawdown division.
- **Fix 6**: Baseline artifact enriched with `lossRate` and `regimesPresent`; `timeoutRate`/`meanLabel` omitted (baselines produce trades, not triple-barrier labels).
- **Fix 7**: New shared modules — `src/alpha-lab/shared/equity-curve.ts` (`buildEquityCurve`) and `src/alpha-lab/shared/trade-builder.ts` (`buildTrades` + `TradeBuilderConfig`). Four consumers deduplicated.
- **Regression caught**: `BacktestTrade` type import accidentally dropped from `walkforward-evaluator.ts` and `evaluation-engine.ts` during local-duplicate removal. Return types still referenced it. Re-added.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 3 pre-existing errors only (alpha-backtest-adapter.ts & mock-candles.ts timestamp type mismatch; migration-runner missing module). Zero from this session.
- `npx vitest run src/alpha-lab` — 15 files, 129/129 pass.
- `npx eslint src/alpha-lab src/desk/backtesting` — 0 errors, 8 pre-existing unused-var warnings.
- code-reviewer subagent: PASS, no findings.

## Lessons Learned

- Dual conventions need explicit documentation at the type level, not just in comments. `MetricsReport.totalPnl` should ideally carry a unit tag or separate types for fraction vs. nominal.
- DRY extraction across four consumers is high-risk for silent type breakage — always grep for return types of removed duplicates before deleting.
- Fabricating zero-values for metrics that don't apply is worse than omitting them. Consumers should handle `undefined` gracefully rather than trusting zeros.

## Next Steps

- Consider adding a `PnlUnit` discriminated union to `MetricsReport` to prevent future convention confusion.
- Pre-existing type errors (alpha-backtest-adapter.ts timestamp mismatch) should be resolved before any further alpha-lab feature work.

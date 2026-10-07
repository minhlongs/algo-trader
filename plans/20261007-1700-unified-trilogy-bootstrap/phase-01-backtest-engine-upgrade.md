# Phase 1: Backtest Engine Upgrade

## Context
Upgrades `BacktestEngine` with Almgren-Chriss non-linear market impact, chronological tick sorting, and Deflated Sharpe Ratio (DSR) bootstrapping.

## Key Insights
- Almgren-Chriss (2000) specifies permanent and temporary market impact:
  $I = \gamma \left(\frac{v}{V}\right) + \eta \sqrt{\frac{v}{V}}$
- Ticks must be chronologically ordered before processing to preserve causal time series.
- Sharpe and DSR calculations must handle zero-variance, single-trade, and multi-trade edge cases gracefully.

## Related Code Files
- `src/alpha-lab/backtest/simulation-engine.ts`
- `src/alpha-lab/backtest/slippage-model.ts`
- `src/alpha-lab/backtest/__tests__/simulation-engine.test.ts`
- `src/alpha-lab/backtest/__tests__/slippage-model.test.ts`

## Success Criteria
- All files <= 200 LOC.
- 0 TypeScript errors.
- 100% tests passing.

---
phase: 5
title: "Strategy Analytics"
status: pending
priority: P2
effort: "~6h"
dependencies: [1]
---

# Phase 5: Strategy Analytics

## Overview

Run systematic backtest on ALL 50 strategies, generate performance report, surface top performers on marketplace.

## Systematic Backtest (C1)

Run `algo trade backtest --strategy=all --days=90` using the existing BacktestRunner.

### Steps
1. **Verify backtest CLI works:** `algo trade backtest --strategy=endgame-v2 --days=30`
2. **Run ALL strategies:** Script that iterates registry and calls backtest
3. **Output CSV:** strategy_name, sharpe, max_drawdown, win_rate, total_pnl, profit_factor, trades, volatility, return_pct
4. **Duration:** ~30-60 min for all 50 strategies (parallel batches of 5)

### File
- Create: `scripts/run-all-backtests.sh` — automation script

## Performance Report (C2)

Generate a report comparing all strategies:

### Metrics per Strategy
| Metric | Source |
|--------|--------|
| Sharpe | BacktestRunner.computeSharpe() |
| Max drawdown | BacktestRunner.computeMaxDrawdown() |
| Win rate | BacktestRunner (trade count) |
| Profit factor | BacktestRunner.computeProfitFactor() |
| Total P&L | BacktestRunner |
| Avg trade duration | Computed from fill timestamps |
| Volatility | BacktestRunner |

### Output
- `docs/strategy-performance-report.md` — ranked by Sharpe
- Top 10 table with key metrics
- Bottom 5 for deprecation consideration

## Surface Top Performers (C3)

Update marketplace listing to show performance metrics:

- Add `sharpe_ratio`, `win_rate`, `total_pnl`, `max_drawdown` to strategy listing response
- Sort by Sharpe by default
- Highlight "Top Performer" badge on top 3
- "Hot" badge on strategies with Sharpe > 2.0

### Related Files
- Modify: marketplace service — add metrics to listing response
- Modify: dashboard marketplace page — display badges + sort

## Success Criteria

- [ ] Backtest runs on ALL 50 strategies without error
- [ ] CSV report generated with all metrics
- [ ] Markdown report: top 10 + bottom 5 ranked by Sharpe
- [ ] Marketplace listing shows performance metrics
- [ ] Top performer badges display correctly
- [ ] `pnpm typecheck` — 0 errors

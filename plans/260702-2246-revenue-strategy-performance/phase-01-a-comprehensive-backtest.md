---
phase: 1
title: "A: Comprehensive Backtest"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Comprehensive Backtest

## Overview

Extend `scripts/run-all-backtests.ts` to cover all 30+ viable strategies (currently 10-sample). Run autonomously, output CSV with Sharpe, win rate, drawdown, profit factor per strategy.

## Requirements

- Run backtest for every PM strategy registered in `strategy-registry.ts` (skip event-driven/manual-only)
- Output CSV with columns: strategy, sharpe_ratio, win_rate_pct, total_pnl_usd, profit_factor, max_drawdown_pct, total_trades, avg_win_usd, avg_loss_usd, best_trade_usd, worst_trade_usd
- Handle market data gaps gracefully (SKIP not FAIL)
- Duration cap per strategy: 5min (skip long-running)
- 0 TypeScript errors, 0 regressions

## Architecture

- `scripts/run-all-backtests.ts` iterates `listStrategies()` and runs `BacktestRunner.run()` per strategy
- Results accumulate in `reports/backtest-results.csv`
- Each row includes `status` field (OK / SKIPPED / ERROR)

## Related Code Files

- **Modify:** `scripts/run-all-backtests.ts` — extend strategy loop from 10 to 30+
- **Read:** `src/desk/polymarket/strategy-registry.ts` — list all strategies
- **Read:** `src/desk/backtesting/backtest-runner.ts` — understand runner API
- **Output:** `reports/backtest-results.csv` — generated

## Implementation Steps

1. Read `strategy-registry.ts` to enumerate all registered strategies
2. Build filter list: exclude event-driven strategies (whale-watch, resolution-arb) and manual-only; target 30+ viable
3. Update `SAMPLE_STRATEGIES` array in `run-all-backtests.ts` with full list
4. Add per-strategy timeout guard (max 5min, skip if exceeded)
5. Run: `pnpm exec tsx scripts/run-all-backtests.ts`
6. Verify CSV output: all rows populated, no hard errors
7. Run `pnpm typecheck && pnpm test` to confirm no regressions

## Success Criteria

- [ ] CSV contains 20+ strategies with valid metrics
- [ ] All strategies have status=OK (failed strategies are marked SKIPPED, not hard errors)
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798 passing

## Risk Assessment

- Some strategies may require specific market conditions not present → mark SKIPPED with reason, don't fail batch
- Backtest runner may be slow on 30+ strategies → set per-strategy timeout
- CSV output schema must match what dashboard (Phase B) expects → coordinate column names

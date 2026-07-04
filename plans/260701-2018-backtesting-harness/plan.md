# Phase 38: Marketplace Backtesting Harness

**Status: superseded — work completed under larger plans
**Priority:** High — enables creator revenue via verified strategy performance

## What

Allow strategy creators to backtest their listed strategies against historical data and display verified performance metrics on marketplace listings.

## Scope (MVP)

| Layer | Deliverable |
|-------|------------|
| `src/desk/backtesting/` | BacktestRunner engine — replay OHLCV data, compute Sharpe/drawdown/win-rate |
| `src/platform/api/routes/` | `POST /api/v1/marketplace/strategies/:id/backtest` (tier-gated) |
| `src/shared/db/migrations/` | New table `marketplace_backtests` for results storage |
| `dashboard/` | Backtest results card on strategy detail page |

## Out of scope

- Community strategy upload (sandbox needed)
- Real-time backtest progress streaming
- Multi-asset portfolio backtests

## Files

- NEW: `src/desk/backtesting/backtest-runner.ts`
- NEW: `src/desk/backtesting/index.ts`
- NEW: `src/shared/db/migrations/034-add-marketplace-backtests.ts`
- MODIFY: `src/platform/api/routes/marketplace-strategy-routes.ts`
- MODIFY: `src/platform/marketplace/repositories/performance-repository.ts`
- MODIFY: `dashboard/src/pages/marketplace-page.tsx`

## Success

- 0 TypeScript errors
- All existing tests pass
- Backtest endpoint returns Sharpe, maxDrawdown, winRate, totalPnl

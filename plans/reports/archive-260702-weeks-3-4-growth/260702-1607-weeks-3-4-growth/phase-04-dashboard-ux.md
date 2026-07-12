---
phase: 4
title: "Dashboard UX"
status: pending
priority: P2
effort: "~6h"
dependencies: [1]
---

# Phase 4: Dashboard UX

## Overview

Improve dashboard: live trading status page, strategy detail with backtest charts, subscriber equity/trade history polish.

## Live Trading Status Page (B2)

New dashboard page or component showing:
- Current positions (token, side, size, entry, current, P&L)
- Guard status (enabled, daily P&L, circuit breaker, consecutive losses)
- Mode (PAPER vs LIVE)
- Quick actions: start/stop, reset circuit breaker

### Related Files
- Create: `dashboard/src/pages/live-trading-page.tsx` (new page)
- Read: API route for orchestrator status (may need new endpoint)

## Strategy Detail Page (B3)

When user clicks a marketplace strategy, show:
- Backtest results: Sharpe, drawdown, win rate, P&L
- Performance chart (time series)
- Price, tier requirements
- Subscribe button

### Related Files
- Modify: `dashboard/src/pages/marketplace-page.tsx` — add detail modal/page
- Read: `dashboard/src/components/backtest-results.tsx` — existing component
- Read: API `GET /:id/backtest`, `GET /:id/backtests`

## Subscriber Pages Polish (B4)

- Subscriber equity: verify data loads, format currency, add time range filter
- Trade history: column sorting, pagination, export CSV
- Overview: fix any stale data issues

### Related Files
- Modify: `dashboard/src/pages/subscriber-equity.tsx`
- Modify: `dashboard/src/pages/subscriber-overview.tsx`
- Modify: `dashboard/src/pages/subscriber-trade-history.tsx`

## Success Criteria

- [ ] Live trading page shows: positions, guard status, mode, actions
- [ ] Strategy detail page shows backtest results (Sharpe, DD, win rate, P&L)
- [ ] Performance chart renders correctly
- [ ] Subscriber equity: data loads, currency formatted
- [ ] Trade history: sorted, paginated, exportable
- [ ] All pages responsive
- [ ] `pnpm typecheck` — 0 errors

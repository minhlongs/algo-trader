---
phase: 2
title: "B: Strategy Performance Dashboard"
status: pending
priority: P1
dependencies: [phase-01-a-comprehensive-backtest]
---

# Phase 2: Strategy Performance Dashboard

## Overview

Build a performance dashboard page at `/app/strategy-performance` showing backtest results from Phase A. Users can sort, filter, compare strategies and view equity curves.

## Requirements

- **Table view:** Sortable by Sharpe, win rate, PnL, drawdown, profit factor
- **Detail view:** Equity curve chart for a selected strategy
- **Comparison mode:** Overlay 2-5 strategy equity curves
- **Tier gating:** PRO+ sees all data; FREE sees summary only (no equity curve)
- **API endpoint:** `GET /api/v1/strategy-performance` — returns backtest CSV data
- **Responsive design:** Matches existing dashboard patterns (sidebar, bento grid)

## Architecture

```
CSV (reports/backtest-results.csv) ──→ API route (analytics-routes.ts) ──→ Dashboard page
                                                                              │
                                                                         Table + Chart
                                                                            components
```

- CSV is read server-side by a new route handler and returned as JSON
- Dashboard page fetches via `fetch('/api/v1/strategy-performance')`
- Equity curve rendered with existing chart library

## Related Code Files

- **Create:** `dashboard/src/pages/strategy-performance-page.tsx` — new dashboard page
- **Create:** `dashboard/src/components/strategy-comparison-chart.tsx` — comparison chart component
- **Modify:** `src/platform/api/routes/analytics-routes.ts` — add GET /api/v1/strategy-performance
- **Modify:** `dashboard/src/App.tsx` — add route
- **Modify:** `dashboard/src/components/sidebar-navigation.tsx` — add nav item

## Implementation Steps

1. Add route handler in `analytics-routes.ts` that reads `reports/backtest-results.csv`, parses to JSON, and returns
2. Create `strategy-performance-page.tsx` with:
   - Fetch on mount, loading state, error state, empty state
   - Sortable table (column header click)
   - Tier check: if FREE, hide equity columns
   - Select strategy → expand equity curve chart
3. Create `strategy-comparison-chart.tsx`:
   - Multi-select checkboxes
   - Overlay equity curves (reuse existing chart component)
4. Wire route in `App.tsx` and nav item in `sidebar-navigation.tsx`
5. Test: `pnpm typecheck`, `pnpm test`

## Success Criteria

- [ ] `/app/strategy-performance` loads with strategy table
- [ ] Columns sortable by click (ascending/descending toggle)
- [ ] Single strategy click shows equity curve
- [ ] Multi-select comparison overlays 2-5 curves
- [ ] FREE tier sees summary only (no equity curve)
- [ ] 0 TypeScript errors, 0 test regressions

## Risk Assessment

- CSV may have parsing edge cases (Infinity, NaN, negative PnL) → handle in route parser
- Chart component may not exist yet → check existing libs; if none, use lightweight chart (e.g., recharts, chart.js)

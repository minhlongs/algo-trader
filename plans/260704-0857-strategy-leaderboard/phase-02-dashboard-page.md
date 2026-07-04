---
phase: 2
title: "Dashboard Page"
status: pending
effort: "S (1 day)"
---

# Phase 2: Dashboard Page

## Overview

Tạo /leaderboard page với sortable table. Hiển thị win rate, Sharpe, P&L, drawdown per strategy.

## Files

```
Create:
├── dashboard/src/pages/leaderboard-page.tsx
└── dashboard/src/components/leaderboard/
    ├── leaderboard-table.tsx      — Sortable table
    ├── leaderboard-row.tsx        — Strategy row
    └── leaderboard-badge.tsx      — Performance badge

Modify:
└── dashboard/src/App.tsx          — Add /leaderboard route
```

## Implementation Steps

### Step 1: Leaderboard Table Component
`leaderboard-table.tsx`: Sortable table with columns:
- Rank, Strategy Name, Win Rate, Sharpe, P&L, Drawdown, Trades, Badge
- Click column header to sort asc/desc
- Highlight top 3 with gold/silver/bronze

### Step 2: Strategy Row Component
`leaderboard-row.tsx`: Individual row with:
- Rank number, strategy name, metric values
- Color coding: green for top quartile, red for bottom
- Sparkline mini-chart for P&L trend (optional)

### Step 3: Performance Badge
`leaderboard-badge.tsx`: Badge types:
- "🏆 Top Performer" — win rate > 70%
- "📈 Rising Star" — improved 10%+ in 7 days
- "✅ Verified" — 100+ trades with consistent Sharpe
- "🆕 New" — less than 30 trades

### Step 4: Leaderboard Page
`leaderboard-page.tsx`: 
- Page header with title + description
- Filter bar: search by strategy name
- Fetch from GET /api/v1/leaderboard
- Loading/error/empty states

### Step 5: Mount Route
In App.tsx: `<Route path="/leaderboard" element={<LeaderboardPage />} />`

## Success Criteria
- [ ] /leaderboard page renders sortable table
- [ ] Sort by clicking column headers
- [ ] Top 3 highlighted with gold/silver/bronze
- [ ] Performance badges displayed
- [ ] Search/filter by strategy name
- [ ] Loading, error, empty states
- [ ] Component tests pass

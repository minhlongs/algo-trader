---
phase: 1
title: "Backend API"
status: pending
effort: "S (1 day)"
---

# Phase 1: Backend API

## Overview

Create GET /api/v1/leaderboard endpoint. Aggregate data from prediction-accuracy-tracker + backtest-runner.

## Files

```
Create:
├── src/platform/api/routes/leaderboard-routes.ts    — GET /leaderboard
└── src/platform/api/routes/__tests__/
    └── leaderboard-routes.test.ts                   — API tests

Modify:
├── src/platform/api/server.ts                       — Mount router
└── src/desk/intelligence/prediction-accuracy-tracker.ts — Export accuracy data
```

## Implementation Steps

### Step 1: Export Accuracy Data
In `prediction-accuracy-tracker.ts`, add:
```typescript
export interface StrategyAccuracy {
  strategyName: string
  winRate: number
  sharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  profitFactor: number
  lastUpdated: string
}

export function getAllStrategyAccuracy(): StrategyAccuracy[]
```

### Step 2: Create Leaderboard Route
`src/platform/api/routes/leaderboard-routes.ts`:
```typescript
router.get('/api/v1/leaderboard', async (req, res) => {
  // 1. Get accuracy data from tracker
  // 2. Merge with backtest-runner data
  // 3. Sort by query param: ?sort=winRate&order=desc
  // 4. Return JSON
})
```

Query params: `?sort=winRate|sharpe|pnl|drawdown&order=asc|desc&limit=50`

### Step 3: Tier Gating
- FREE: view leaderboard, no sorting
- PRO+: sort, filter, export CSV

### Step 4: Mount Route
Add to server.ts: `server.use(leaderboardRouter)`

### Step 5: Tests
Test: returns correct data, sort works, tier gating works, empty state.

## Success Criteria
- [ ] GET /api/v1/leaderboard returns strategy rankings
- [ ] Sort by win rate, Sharpe, P&L, drawdown
- [ ] Tier gating: FREE=view, PRO+=sort
- [ ] Tests pass

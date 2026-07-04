---
title: "Brainstorm: Strategy Leaderboard — Next Wave VII"
created: "2026-07-04T08:57:00.000Z"
status: approved
---

# Strategy Leaderboard — Next Wave VII

## Goal
Public page xếp hạng strategies theo win rate, Sharpe, P&L. Dashboard page + API + Telegram.

## Approach A + C: Dashboard page + Telegram command

### Files
```
Create:
├── dashboard/src/pages/leaderboard-page.tsx
├── dashboard/src/components/leaderboard/leaderboard-table.tsx
├── dashboard/src/components/leaderboard/leaderboard-row.tsx
├── dashboard/src/components/leaderboard/leaderboard-badge.tsx
├── src/platform/api/routes/leaderboard-routes.ts
└── src/platform/telegram/leaderboard-handler.ts

Modify:
├── dashboard/src/App.tsx
├── src/platform/api/server.ts
├── src/platform/telegram/bot.ts
└── src/desk/intelligence/prediction-accuracy-tracker.ts
```

## Success Metrics
- [ ] /leaderboard page shows all strategies ranked by win rate
- [ ] Sort by: win rate, Sharpe, P&L, drawdown
- [ ] Top performers get badges
- [ ] GET /api/v1/leaderboard returns JSON
- [ ] Telegram /leaderboard returns top 5
- [ ] 2,916+ tests, 0 regressions

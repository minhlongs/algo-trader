---
title: "Strategy Leaderboard — Next Wave VII"
description: "Public rankings page: win rate, Sharpe, P&L per strategy. Dashboard page + API + Telegram."
status: complete
priority: P2
branch: main
tags:
  - leaderboard
  - strategies
  - dashboard
  - telegram
blockedBy: []
blocks: []
created: "2026-07-04T08:57:00.000Z"
createdBy: "ck:brainstorm → ck:plan"
source: brainstorm
brainstorm: plans/reports/brainstorm-260704-0857-leaderboard-report.md
---

# Strategy Leaderboard — Next Wave VII

## Overview

Public page xếp hạng tất cả strategies theo win rate, Sharpe, P&L. Kết hợp Dashboard page + API endpoint + Telegram command.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Backend API](./phase-01-backend-api.md) | 1 day | Pending |
| 2 | [Dashboard Page](./phase-02-dashboard-page.md) | 1 day | Pending |
| 3 | [Telegram Command](./phase-03-telegram-command.md) | 0.5 day | Pending |
| 4 | [Verify and Merge](./phase-04-verify-and-merge.md) | 0.5 day | Pending |

## Success Criteria
- [ ] GET /api/v1/leaderboard returns strategy rankings with metrics
- [ ] Sort by: win rate, Sharpe, P&L, drawdown
- [ ] /leaderboard page renders with sortable table
- [ ] Top performers display performance badges
- [ ] Telegram /leaderboard returns top 5
- [ ] 2,916+ tests, 0 regressions

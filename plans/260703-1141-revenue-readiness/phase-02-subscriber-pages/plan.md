---
title: "Phase 2 — Wire Subscriber Pages"
description: "Wire subscriber-equity, subscriber-overview, and subscriber-trade-history into App.tsx routes, add backend APIs, link from marketplace"
status: complete
priority: P0
effort: M
needsStitch: true
---

# Phase 2 — Wire Subscriber Pages

## Context
3 complete subscriber pages exist but have no routes:
- `subscriber-equity.tsx` — KPI row + chart, calls `/api/subscriber/:id/pnl`
- `subscriber-overview.tsx` — P&L summary, activity KPIs, auto-refresh
- `subscriber-trade-history.tsx` — paginated trade history with daily breakdown

## Tasks
1. **Stitch Design**: Design subscriber dashboard screens with gold design system
2. **Frontend**: Wire pages into App.tsx under `/app/subscriber/:id/*` routes
3. **Backend**: Add `/api/v1/subscriber/:id/{pnl,equity,trades}` endpoints
4. **Integration**: Link from marketplace page to subscriber pages

## Files to modify
- `dashboard/src/App.tsx`
- `dashboard/src/pages/marketplace-page.tsx` (add "View Dashboard" link)
- Backend API routes (subscriber controller)

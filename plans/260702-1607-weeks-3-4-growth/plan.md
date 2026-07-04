---
title: "Weeks 3-4: Platform Growth + Dashboard UX + Strategy Analytics"
description: "Add 5 marketplace listings, improve payment/dashboard UX, Telegram commands, referral go-live, systematic backtest all strategies, surface top performers"
status: complete — all phases done
priority: P2
branch: "main"
tags: [marketplace, dashboard, telegram, referral, analytics, growth]
blockedBy: [260702-1411-go-live-week-1, 260702-1516-monitoring-stack]
blocks: []
created: "2026-07-02T09:21:12.342Z"
createdBy: "ck:plan"
source: skill
sessionId: "sophia-weeks3-4"
brainstorm: "../../reports/brainstorm-260702-1607-weeks-3-4-growth.md"
---

# Weeks 3-4: Platform Growth + Dashboard UX + Strategy Analytics

## Overview

Go Live Tuần 1 và Monitoring Tuần 2 đã hoàn thành. Giờ focus vào growth: đưa platform từ "chạy được" thành "có customers kiếm tiền." 3 tracks song song.

## Phases

| Phase | Name | Status | Tracks |
|-------|------|--------|--------|
| 1 | [Marketplace Listings](./phase-01-marketplace-listings.md) | ✅ Complete | A1 |
| 2 | [Payment UX and Referral](./phase-02-payment-ux-and-referral.md) | ✅ Complete | A2, B1 |
| 3 | [Telegram Commands and Blog](./phase-03-telegram-commands-and-blog.md) | ✅ Complete | A3, A4 |
| 4 | [Dashboard UX](./phase-04-dashboard-ux.md) | ✅ Complete | B2, B3, B4 |
| 5 | [Strategy Analytics](./phase-05-strategy-analytics.md) | ✅ Complete | C1, C2, C3 |

## Dependencies

Phases 1-3 có thể chạy song song (Week 3).
Phases 4-5 chạy sau (Week 4) — không có dep cứng.

```
Week 3:
  Phase 1 (Listings) ─── parallel ───┐
  Phase 2 (UX+Referral) ─────────────┤── all parallel
  Phase 3 (Telegram+Blog) ───────────┘
  
Week 4:
  Phase 4 (Dashboard) ─── parallel ─── Phase 5 (Analytics)
```

## Success Criteria

- [ ] 5+ non-V2 strategies listed on marketplace with real prices
- [ ] Subscribe flow: click → checkout URL → pay USDT → strategy executes
- [ ] Referral: user generates code, shares, gets commission
- [ ] Telegram: /campaign lists strategies, /results shows P&L
- [ ] Dashboard: live trading status, strategy detail with backtest charts
- [ ] Strategy analytics: systematic backtest report for ALL strategies
- [ ] 0 regressions: all 2,798 tests pass
- [ ] `pnpm typecheck` — 0 errors

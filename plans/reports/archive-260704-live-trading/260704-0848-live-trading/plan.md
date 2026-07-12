---
title: "Live Trading — Next Wave VI"
description: "Deploy $500 USDC capital on Polymarket. Prove a16z solo quant thesis with live P&L."
status: pending
priority: P1
branch: main
tags:
  - live-trading
  - polymarket
  - capital-deployment
blockedBy: []
blocks: []
created: "2026-07-04T08:48:00.000Z"
createdBy: "ck:brainstorm → ck:plan --deep --parallel"
source: brainstorm
brainstorm: plans/reports/brainstorm-260704-0848-live-trading-report.md
---

# Live Trading — Next Wave VI

## Overview

Chuyển từ paper mode → live capital ($500 USDC) trên Polymarket. Chứng minh edge thật. Đây là luận điểm cốt lõi của a16z solo quant desk.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Strategy Selection](./phase-01-strategy-selection.md) | 1 day | Pending |
| 2 | [Risk Configuration](./phase-02-risk-configuration.md) | 1 day | Pending |
| 3 | [Fund and Go Live](./phase-03-fund-and-go-live.md) | 1 day | Pending |
| 4 | [Monitor and Journal](./phase-04-monitor-and-journal.md) | Ongoing | Pending |

**Execution order:** Sequential (Phase 1 → 2 → 3 → 4)

## Success Criteria
- [ ] $500 USDC deposited on Polymarket
- [ ] PAPER_MODE=false, all 4 API vars configured
- [ ] Top 3 strategies selected based on backtest data
- [ ] Kelly sizing + drawdown limit + circuit breaker configured
- [ ] First live trade executed successfully
- [ ] Trade journal recording every position
- [ ] Telegram alerts firing for fills, drawdown, circuit breaker
- [ ] 2,916+ tests, 0 regressions

## Key Config
- PAPER_MODE=false
- Capital: $500 USDC
- Risk: quarter-Kelly, 5% daily loss limit, 15% max drawdown
- Alerts: Telegram for all trade events

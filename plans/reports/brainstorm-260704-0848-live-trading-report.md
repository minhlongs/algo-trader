---
title: "Brainstorm: Live Trading — Next Wave VI"
created: "2026-07-04T08:48:00.000Z"
status: approved
---

# Live Trading — Next Wave VI

## Goal
Chuyển paper mode → live capital ($500 USDC) trên Polymarket. Chứng minh edge thật.

## Approach
```
Phase 1: Pick 3 best strategies from backtest data
Phase 2: Configure Kelly risk + circuit breaker thresholds
Phase 3: Fund $500 USDC, PAPER_MODE=false, go live
Phase 4: Monitor + Journal every trade
```

## Key Config
- PAPER_MODE=false
- Capital: $500 USDC
- Strategy: top 3 from backtest CSV
- Risk: quarter-Kelly, 5% daily loss limit, 15% max drawdown
- Alerts: Telegram for fills, drawdown, circuit breaker

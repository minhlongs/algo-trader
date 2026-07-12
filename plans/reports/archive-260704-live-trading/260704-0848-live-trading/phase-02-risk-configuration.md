---
phase: 2
title: "Risk Configuration"
status: pending
effort: "S (1 day)"
---

# Phase 2: Risk Configuration

## Overview

Cấu hình risk limits trước khi go live.

## Implementation Steps

### Step 1: Kelly Position Sizer
- quarterKelly=true, maxPositionSize=$50, minEdge=0.05

### Step 2: Drawdown Monitor
- maxDrawdown=15%, dailyLossLimit=5%, alertThresholds=[5%,10%,15%]

### Step 3: Circuit Breaker
- threshold=15%, cooldownMinutes=60, maxConsecutiveLosses=3

### Step 4: Live Exec Guard
- minLiquidity=$1000, maxSlippage=2%, requireConfirmation=true

### Step 5: Telegram Alerts
- Enable: trade_fill, drawdown_warning, circuit_breaker, daily_summary

### Step 6: Verify
```bash
algo risk && algo doctor
```

## Success Criteria
- [ ] Kelly: quarter-Kelly, max $50/position
- [ ] Drawdown: 15% max, 5% daily limit
- [ ] Circuit breaker: 15%, 60min cooldown
- [ ] Live guard: $1000 min liquidity, 2% slippage
- [ ] Telegram alerts configured
- [ ] `algo risk` and `algo doctor` pass

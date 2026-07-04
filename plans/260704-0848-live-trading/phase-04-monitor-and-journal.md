---
phase: 4
title: "Monitor and Journal"
status: pending
effort: "Ongoing"
---

# Phase 4: Monitor and Journal

## Overview

Theo dõi real-time P&L, ghi journal mỗi trade, weekly review. Ongoing phase.

## Implementation Steps

### Step 1: Daily Monitoring
```bash
algo status   # Morning: positions, P&L
algo risk     # Morning: risk exposure, drawdown
algo report   # Evening: daily P&L
```

### Step 2: Trade Journal
Auto-recorded by live-trading-journal.ts. Verify:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM trade_journal WHERE traded_at > NOW() - INTERVAL '24 hours'"
```

### Step 3: Weekly Review
Every Monday: review trades, calculate win rate/Sharpe/P&L, adjust parameters.

### Step 4: Manifesto Update
After first $500 P&L: update docs/manifesto.md d3_live_pnl_from.

### Step 5: Telegram Alerts
- trade_fill, drawdown_warning, circuit_breaker, daily_summary

## Success Criteria
- [ ] Daily monitoring established
- [ ] Trade journal recording (verify DB)
- [ ] Weekly review routine
- [ ] Telegram alerts firing
- [ ] Manifesto updated with live P&L
- [ ] Drawdown > 10%: strategies reviewed
- [ ] Drawdown > 15%: circuit breaker, manual review

---
phase: 3
title: "Fund and Go Live"
status: pending
effort: "S (1 day)"
---

# Phase 3: Fund and Go Live

## Overview

Fund $500 USDC vào Polymarket, set PAPER_MODE=false, deploy live.

## Implementation Steps

### Step 1: Fund Wallet
Acquire $500 USDC on Polygon → send to Polymarket wallet. Verify balance.

### Step 2: Configure .env
```bash
PAPER_MODE=false
POLYMARKET_API_KEY=
POLYMARKET_PRIVATE_KEY=
POLYMARKET_SIGNING_KEY=
POLYMARKET_SIGNING_SECRET=
```

### Step 3: Start Live Bot
```bash
PAPER_MODE=false npx ts-node src/index.ts start
```

### Step 4: Verify First Trade
Check Polymarket portfolio, Telegram alert, `algo status`.

### Step 5: 24h Observation
Monitor only. If any anomaly: PAPER_MODE=true to stop.

## Success Criteria
- [ ] $500 USDC on Polymarket
- [ ] PAPER_MODE=false, API vars configured
- [ ] Live bot starts without errors
- [ ] First live order placed
- [ ] Telegram alert received
- [ ] 24h observation passed
- [ ] Rollback: PAPER_MODE=true documented

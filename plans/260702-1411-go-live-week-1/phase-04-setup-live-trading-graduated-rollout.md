---
phase: 4
title: "Setup Live Trading Graduated Rollout"
status: pending
priority: P1
effort: "~2h"
dependencies: [1, 3]
---

# Phase 4: Setup Live Trading Graduated Rollout

## Overview

Start live trading with minimal capital using a graduated rollout: paper trading first, then 0.5% bankroll, then scale winners. Risk gates are enforced by code (LiveExecutionGuard) — this phase configures and starts them.

## Prerequisites

- Phase 1 complete (latest code deployed)
- Phase 3 complete (IPN/payment config)
- Polymarket API keys generated at https://polymarket.com/settings/api
- Bankroll deposited to Polymarket wallet (USDC on Polygon)

## Non-Negotiable Constraints

- **Quarter-Kelly sizing:** Max 2% bankroll per trade (default: 0.5% for rollout)
- **Daily loss limit:** 5% → halt all live trading
- **Max concurrent:** 10 live positions
- **Circuit breaker:** 3 consecutive losses → revert to PAPER
- **Default mode:** PAPER — live requires explicit `--mode=live` flag

## Related Code Files

- **Read:** `src/desk/execution/live-execution-guard.ts` — risk gate config
- **Read:** `src/desk/execution/polymarket-execution-adapter.ts` — adapter builder
- **Read:** `src/desk/cli/cashclaw-trade-commands.ts` — CLI commands
- **Read:** `docs/live-trading-runbook.md` — bilingual operational runbook
- **Read:** `.env.example` — env var names (POLYMARKET_* / POLY_*)

## Implementation Steps

### Day 1: Set up environment

1. **Generate Polymarket API keys:**
   - Login to polymarket.com → Settings → API Keys
   - Create key with trading permissions
   - Save: API Key, API Secret, Passphrase, Private Key
2. **Set env vars:**
   ```
   POLYMARKET_API_KEY=<key>
   POLYMARKET_API_SECRET=<secret>
   POLYMARKET_PASSPHRASE=<passphrase>
   POLYMARKET_PRIVATE_KEY=<private-key>
   ```
3. **Verify adapter:** `algo trade status` — should show PAPER mode, healthy, no errors
4. **List available strategies:** `algo trade list-strategies` — confirm 30+ V2 strategies visible

### Day 1-2: Paper trading verification

5. **Run paper trading with 5 best strategies:**
   ```
   algo trade run --strategy=endgame-v2,spread-mean-reversion,regime-adaptive-momentum-v2,resolution-frontrunner-v2,time-weighted-mean-reversion-v2 --mode=paper --ticks=100
   ```
6. **Verify paper output:** Check `data/paper-trades.json` for fills, P&L
7. **Verify guard in paper mode:** Guard should be disabled (default) — confirm with `algo trade status`

### Day 3: Live with minimal capital

8. **Deposit USDC to Polymarket wallet** (e.g., $200-500)
9. **Configure guard for small risk:**
   - Set `QUARTER_KELLY=0.005` (0.5% bankroll = $1-2.50 per trade)
   - Set `DAILY_LOSS_LIMIT=0.05` (5% = $10-25 max daily loss)
   - Set `MAX_CONCURRENT_POSITIONS=3` (conservative)
10. **Start live trading:**
    ```
    algo trade start --strategy=endgame-v2 --mode=live
    ```
11. **Monitor first hour:** `algo trade status` every 5 min — verify fills, P&L, guard state

### Day 4-7: Scale winners

12. **Review performance** — which strategies are positive?
13. **Scale to 2% bankroll** on strategies with positive P&L after 48h
14. **Increase max concurrent** to 10
15. **Set up regular monitoring cadence** (daily check-in)

## Rollback (if losses exceed 5%)

```bash
# Stop all live trading
algo trade start --mode=paper

# Or disable live mode entirely
# Set env var: LIVE_TRADING_ENABLED=false
```

## Success Criteria

- [ ] Polymarket API keys generated and tested
- [ ] Paper trading produces fills and P&L tracking
- [ ] Live trading starts with 0.5% bankroll per trade
- [ ] Guard blocks oversized trades (test: attempt trade >2% bankroll)
- [ ] Daily loss limit triggers stop (test: simulated losses)
- [ ] `algo trade status` shows live positions + P&L
- [ ] Circuit breaker reverts to PAPER after 3 consecutive losses
- [ ] Bilingual runbook verified accurate

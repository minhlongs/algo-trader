---
phase: 1
title: "Strategy Selection"
status: pending
effort: "S (1 day)"
---

# Phase 1: Strategy Selection

## Overview

Chọn 3 strategies tốt nhất từ backtest data để deploy live capital đầu tiên.

## Implementation Steps

### Step 1: Run Backtest Suite
```bash
cd /Users/macbook/algo-trader
npx ts-node scripts/backtest-all-strategies.sh
```

Output: CSV with strategy_name, win_rate, sharpe_ratio, max_drawdown, profit_factor.

### Step 2: Review Polymarket Strategies
Focus on: spread-mean-reversion-v2, cross-market-arb-v2, market-maker-v2, cycle-end-sniper, endgame-detector.

### Step 3: Select Top 3
Criteria: win rate > 60%, Sharpe > 1.0, max drawdown < 10%, min 30 trades.

### Step 4: Configure Parameters
- maxPositionSize: $50 (10% of $500)
- minConfidence: 0.65
- maxConcurrent: 3

### Step 5: 24h Paper Mode Test
```bash
PAPER_MODE=true npx ts-node src/index.ts start
```

## Success Criteria
- [ ] Backtest CSV generated
- [ ] Top 3 strategies selected (win rate > 60%, Sharpe > 1.0)
- [ ] 24h paper mode: signals fire correctly, no errors

# Phase B: Trading Edge Feedback Loop

**Effort:** M (2-3 weeks core; backfill stubs adds 1-2 weeks)
**Parallel-safe:** Yes (files isolated from other tracks — `src/desk/` scope only)
**Impact:** High — validated edge is the #1 conversion driver for quant trading

## Context

From the brainstorm: *"Prediction accuracy tracking exists but is disconnected from fusion engine. Regime detector is built but unused by fusion engine. No published performance data exists."* The three components exist independently — wiring them creates systematic edge improvement without new strategies or capital.

## Files to Modify

```
src/desk/
├── intelligence/
│   ├── prediction-accuracy-tracker.ts     — Add feedback output interface
│   ├── signal-fusion-engine.ts            — Accept weight updates from tracker
│   ├── reflection-engine.ts               — Accept accuracy data for parameter tuning
│   └── dna/
│       └── DnaEngine.ts                   — Expose regime detector output
├── strategies/
│   ├── polymarket/
│   │   ├── spread-mean-reversion-v2.ts    — Priority strategy for replacement
│   │   ├── cross-market-arb-v2.ts         — Priority strategy for replacement
│   │   ├── market-maker-v2.ts             — Priority strategy for replacement
│   │   └── base-polymarket-strategy.ts    — Base class updates if needed
│   ├── base-strategy.ts                   — Updated backtest interface
│   └── __tests__/
│       └── strategy-backtest-integration.test.ts  — NEW: comprehensive
├── signal/
│   └── signal-fusion-accuracy.test.ts     — NEW: accuracy loop test
├── execution/
│   ├── backtest-runner.ts                 — Extend for standardized CSV output
│   └── run-all-backtests.ts               — Cover all 30+ V2 strategies
├── risk/
│   └── kelly-position-sizer.ts            — May need regime-aware sizing
├── market-data/
│   └── gamma-client.ts                    — For backtesting against real data
src/platform/
├── marketplace/
│   ├── strategy-listing-service.ts        — Add performance metrics to listing
│   ├── badge-service.ts                   — Update badge criteria with real data
│   └── api/
│       └── marketplace-listing-routes.ts  — Serve performance metrics
└── dashboard/
    └── src/
        └── components/
            └── strategy-performance-card.tsx  — NEW: performance display

scripts/
└── backtest-all-strategies.sh             — Run full backtest suite
```

## Implementation Steps

### Step 1: Regime-Adaptive Signal Fusion (Days 1-3)
**Priority: P1 — Wires existing components with minimal new code.**

1. Read `DnaEngine.ts` — understand regime detector output (bull/bear/sideways + confidence)
2. Read `signal-fusion-engine.ts` — understand current weight allocation
3. Add `regimeService` import to `signal-fusion-engine.ts`
4. Implement regime-adaptive weight multiplier:
   - Bull market: momentum strategies get +20% weight, mean-reversion -10%
   - Bear market: mean-reversion +20%, momentum -10%
   - Sideways: range-bound strategies +15%, trend-following -10%
5. Add tests: `signal-fusion-accuracy.test.ts` — verify weight shifts under different regimes
6. **Total code: ~200-300 lines**

### Step 2: Prediction Accuracy Closed-Loop (Days 4-7)
1. Read `prediction-accuracy-tracker.ts` — understand current output (win rate, Sharpe, by-strategy?)
2. Read `reflection-engine.ts` — understand current parameter adjustment
3. Add accuracy data export interface to tracker
4. Wire tracker output into `signal-fusion-engine.ts` weight updates:
   - Strategies below win rate threshold (< 50%) get weight reduced
   - Strategies above threshold get weight increased proportionally
5. Wire tracker output into `reflection-engine.ts` parameter tuning:
   - Adjust strategy parameters based on accuracy trend (not just snapshot)
   - If a strategy is degrading, reduce its allocation or flag for review
6. Add integration test: accuracy change → weight update → reflected in next signal
7. **Total code: ~300-400 lines**

### Step 3: Backtest All 30+ V2 Strategies (Days 8-12)
1. Read `backtest-runner.ts` — understand current backtest output format
2. Read `run-all-backtests.ts` — understand current coverage
3. Extend `backtest-runner.ts` output to include standardized CSV:
   - Columns: strategy_name, total_trades, win_rate, sharpe_ratio, max_drawdown, profit_factor, avg_return, regime
4. Create `scripts/backtest-all-strategies.sh` — runs all 30+ V2 strategies against Gamma historical data
5. For each strategy stub, run the backtest:
   - Strategy passes → record metrics
   - Strategy stub fails → flag as "unimplemented" — don't crash the suite
6. Generate `/tmp/backtest-results-YYYYMMDD.csv` with all results
7. Run and save: `cp /tmp/backtest-results-*.csv reports/backtest-results-260703.csv`

### Step 4: Fill Top 5 Performing Strategy Stubs (Days 13-18)
Based on Step 3 results, replace the top 5 stubs with real implementations:
1. Start with the stub files in `src/desk/strategies/polymarket/`
2. Implement real logic following `base-polymarket-strategy.ts` pattern
3. Each strategy needs: `evaluateSignal()`, `calculatePosition()`, `manageRisk()`
4. Add unit tests for each filled strategy
5. Re-run backtest to verify performance

### Step 5: Publish Strategy Performance Data on Marketplace (Days 19-21)
1. Read marketplace listing routes and card component
2. Add performance metrics to `strategy-listing-service.ts`:
   ```typescript
   interface StrategyPerformance {
     winRate: number
     sharpeRatio: number
     maxDrawdown: number
     totalTrades: number
     profitFactor: number
     backtestDate: string
   }
   ```
3. Update `strategy-performance-card.tsx` to display metrics
4. Update badge criteria — top performers get "Verified" badge based on backtest data
5. Wire `GET /api/v1/marketplace/strategies/:id/performance` endpoint

## Related Files
- `src/desk/intelligence/prediction-accuracy-tracker.ts`
- `src/desk/intelligence/signal-fusion-engine.ts`
- `src/desk/intelligence/reflection-engine.ts`
- `src/desk/intelligence/dna/DnaEngine.ts`
- `src/desk/execution/backtest-runner.ts`
- `src/desk/execution/run-all-backtests.ts`
- `src/desk/strategies/polymarket/` (23 stub files)
- `src/platform/marketplace/strategy-listing-service.ts`
- `src/platform/marketplace/badge-service.ts`
- `dashboard/src/components/strategy-performance-card.tsx`

## Todo List
- [ ] Wire regime detector into signal fusion weights
- [ ] Close prediction accuracy feedback loop (tracker → fusion → reflection)
- [ ] Backtest all 30+ V2 strategies with standardized CSV output
- [ ] Fill top 5 performing strategy stubs with real logic
- [ ] Publish strategy performance data on marketplace cards
- [ ] Add accuracy loop integration tests
- [ ] Add performance card UI component
- [ ] Update badge criteria with real backtest data

## Success Criteria
- [ ] Prediction accuracy verified at 66%+ win rate on paper trades (up from ~55-60%)
- [ ] Regime detector actively influencing fusion weights (verified by test)
- [ ] 30+ strategies backtested with CSV output saved to reports/
- [ ] Top 5 strategy stubs replaced with real working implementations
- [ ] Marketplace cards showing: win rate, Sharpe, drawdown for each strategy

## Risk Assessment
- **23 stubs reveal negative edge**: If most stubs backtest at <50% win rate, the "52 strategies" claim becomes a liability. Pre-frame marketing. Remove worst performers.
- **No viable historical data for backtesting**: Gamma client may not have enough history. Paper trading logs may be incomplete. Fallback: synthetic OHLCV from Kronos.
- **Accuracy loop could degenerate**: A strategy that worked historically may stop working. The reflection engine needs a freshness decay, not just cumulative accuracy.

# Scout Report: Track B — Trading Edge Feedback Loop

**Date:** 2026-07-03
**Scoped by:** Phase B phase file (`phase-b-trading-edge-feedback-loop.md`)
**Work context:** /Users/macbook/algo-trader

---

## 1. Files that Exist and Their Current State

### 1.1 Core Intelligence Layer

**`src/desk/intelligence/prediction-accuracy-tracker.ts`** (242 lines) — EXISTS, full implementation
- Records predictions to `data/predictions.json`, checks resolution via Gamma API, computes accuracy reports
- Output: `getAccuracyReport()` returns `AccuracyReport` with `byStrategy` and `byConfidenceBucket` breakdowns
- Currently has NO exportable interface for external consumption — only logs and returns a report object
- **What needs to change:** Add a feedback output interface so `signal-fusion-engine` and
  `reflection-engine` can subscribe/consume accuracy data. The data exists but is not wired.

**`src/desk/intelligence/signal-fusion-engine.ts`** (159 lines) — EXISTS, full implementation
- Pure mathematical signal combination: weighted average → direction + confidence
- Has `fuseSignals()` and `updateWeights()` (EMA-based self-learning feedback loop)
- Currently has NO regime awareness, NO connection to prediction-accuracy-tracker
- Exported constants: `EMA_DECAY=0.9`, `CORRECT_BOOST=1.2`, `INCORRECT_DECAY=0.8`
- **What needs to change:** (a) Add regime-adaptive weight multiplier based on regime detector
  output, (b) Wire accuracy tracker output for weight updates

**`src/desk/intelligence/reflection-engine.ts`** — MISSING (file does not exist anywhere in repo)

### 1.2 DNA / Regime Detector

**`src/desk/strategies/dna/regime-detector.ts`** (99 lines) — EXISTS, full implementation
- **NOT at `src/desk/intelligence/dna/DnaEngine.ts` as phase file says**
- Actual path: `src/desk/strategies/dna/regime-detector.ts`
- Classifies market into `trending_up | trending_down | ranging | volatile`
- Output type: `RegimeSnapshot { regime, regimeConfidence, dominantTf, reason, validFrom, validUntil }`
- Exports `detectRegime()` and `isRegimeFresh()` as pure functions
- Regime types defined in `src/desk/strategies/dna/multi-tf-types.ts`
- **What needs to change:** Expose regime detector output as a consumable service that
  signal-fusion-engine can import. Currently it's a pure function in the DNA domain.

### 1.3 Strategy Infrastructure

**`src/desk/strategies/polymarket/base-polymarket-strategy.ts`** (319 lines) — EXISTS, full implementation
- Abstract base class with position management, TP/SL exits, cooldowns, event emission
- Has `execute()` tick lifecycle, `toTickFn()` for legacy compat
- Accepts `StrategyDeps` (clob, orderManager, eventBus, gamma, riskManager)
- **What needs to change:** Add backtest-compatible interface hooks if strategies need to
  report telemetry for the accuracy loop

**`src/desk/strategies/polymarket/spread-mean-reversion-v2.ts`** (180 lines) — EXISTS, full implementation
- Fully migrated to BasePolymarketStrategy with `scanEntries()`, spread tracking, EMA
- Pure helpers exported for testing: `calcSpread()`, `calcSpreadDeviation()`, `updateSpreadEma()`, etc.
- **Note:** Phase file lists this as "priority strategy for replacement," but it is already a
  real implementation. The "stub replacement" concern in Step 4 does not apply to this file.

**`src/desk/strategies/polymarket/cross-market-arb.ts`** — EXISTS (non-v2 version at
  `src/desk/strategies/polymarket/cross-market-arb.ts`)
**`src/desk/strategies/polymarket/market-maker.ts`** — EXISTS (non-v2 version at
  `src/desk/strategies/polymarket/market-maker.ts`)
**`src/desk/strategies/polymarket/cross-market-arb-v2.ts`** — MISSING
**`src/desk/strategies/polymarket/market-maker-v2.ts`** — MISSING

**`src/desk/strategies/base-strategy.ts`** — MISSING (no such file in the repo)

### 1.4 Backtesting

**`src/desk/backtesting/backtest-runner.ts`** (357 lines) — EXISTS, full implementation
- **NOT at `src/desk/execution/backtest-runner.ts` as phase file says**
- Actual path: `src/desk/backtesting/backtest-runner.ts`
- Fully implemented with: `BacktestOrderManager` (mock), `GammaHistoricalProvider` (synthetic
  data), `computeMetrics()`, mock ClobClient and GammaClient
- Takes `BacktestConfig` (`strategy`, `paperTrading`, `capitalUsdc`, `days`, `tickIntervalMs`)
- Returns `BacktestResult` with `metrics`, `trades`, `equityCurve`
- **NOTE:** The `GammaHistoricalProvider` generates SYNTHETIC price data (deterministic random
  walk), not real historical data. This is a risk the phase file identified.
- **What needs to change:** Extend output to include standardized CSV format with specified columns

**`scripts/run-all-backtests.ts`** (160 lines) — EXISTS, full implementation
- **NOT at `src/desk/execution/run-all-backtests.ts` as phase file says**
- Actual path: `scripts/run-all-backtests.ts`
- Iterates all registered strategies from `strategy-registry.ts`, runs 30-day backtest per
  strategy on $5000 capital, writes CSV to `reports/backtest-results.csv`
- Has per-strategy timeout (5 min), excludes `resolution-frontrunner` and `listing-arbitrage-sniper`
- CSV columns: strategy, sharpe_ratio, win_rate_pct, total_pnl_usd, profit_factor,
  max_drawdown_pct, total_trades, winning_trades, losing_trades, avg_pnl_per_trade_usd,
  best_trade_usd, worst_trade_usd, duration_ms, status
- **NOTE:** This file already largely matches what Step 3 needs. The phase file's CSV spec
  differs slightly (wants `regime` column, `strategy_name` vs `strategy`, no `best_trade`/`worst_trade`)

Also exists: `scripts/run-all-backtests.sh` (shell wrapper, 1KB)

### 1.5 Risk

**`src/desk/risk/kelly-position-sizer.ts`** (115 lines) — EXISTS
- Quarter-Kelly default, configurable fraction, hard cap at 5% of portfolio
- Takes `winProbability`, `winLossRatio`, `portfolioValue`
- Duplicate at `src/desk/polymarket/kelly-position-sizer.ts`
- **What needs to change:** May need regime-aware sizing (currently agnostic to market regime)

### 1.6 Marketplace

**`src/platform/marketplace/services/marketplace.service.ts`** (318 lines) — EXISTS, full implementation
- DB-backed singleton composing repositories (Strategy, Listing, Vetting, Review, Performance)
- Has `listStrategies()` with performance-based sorting/sorting/filtering, already attaches
  `sharpeRatio`, `winRate`, `maxDrawdown`, `totalPnlUsd` from DB or backtestSummary fallback
- Has `getStrategyPerformance()` and `updateStrategyPerformance()` methods
- **What needs to change:** Performance data is already flowing in listStrategies, but needs a
  dedicated `getStrategyPerformance()` endpoint that returns the phase spec's `StrategyPerformance` interface

**`src/platform/marketplace/services/badge-service.ts`** (159 lines) — EXISTS, full implementation
- Computes badges: `verified_creator`, `top_performer`, `low_risk`, `high_volume`,
  `consistent_returns`, `new_strategy`
- Uses DB-backed performance data (Sharpe percentile, max drawdown, total trades)
- **What needs to change:** Badge criteria already uses real data. Need to ensure backtest data
  feeds into the perf DB table so badge service has fresh data.

**`src/platform/api/routes/marketplace-strategy-listings-routes.ts`** (167 lines) — EXISTS
- **NOT at `src/platform/marketplace/api/marketplace-listing-routes.ts` as phase file says**
- Actual path: `src/platform/api/routes/marketplace-strategy-listings-routes.ts`
- Has GET / (list), POST /publish, GET /:id (details)
- Routes use `requireTier('FREE')` middleware, Zod validation
- **What needs to change:** Add `GET /:id/performance` endpoint

**`src/platform/marketplace/services/strategy-listing-service.ts`** — MISSING
  (strategy listing logic lives in `marketplace.service.ts` instead)

### 1.7 Market Data

**`src/desk/polymarket/gamma-client.ts`** — EXISTS
- **NOT at `src/desk/market-data/gamma-client.ts` as phase file says**
- Actual path: `src/desk/polymarket/gamma-client.ts`

---

## 2. Files That Need to be Created (NEW)

| File | Reason | Priority |
|------|--------|----------|
| `src/desk/intelligence/reflection-engine.ts` | Does not exist anywhere. Needs to accept accuracy data and tune strategy parameters. | P1 |
| `src/desk/strategies/__tests__/strategy-backtest-integration.test.ts` | NEW per phase spec. Comprehensive integration test for accuracy loop. | P1 |
| `src/desk/signal/signal-fusion-accuracy.test.ts` | NEW per phase spec. Tests accuracy loop: accuracy change → weight update → reflected in next signal. | P1 |
| `scripts/backtest-all-strategies.sh` | NEW per phase spec (runs all backtests). `scripts/run-all-backtests.sh` exists but may not match exact spec. | P2 |

### Optional / Could-Skip:

| File | Reason |
|------|--------|
| `src/desk/strategies/base-strategy.ts` | Phase file lists this, but no such file exists in current codebase. The concept is covered by `base-polymarket-strategy.ts`. |
| `src/desk/market-data/gamma-client.ts` | Exists at `src/desk/polymarket/gamma-client.ts` — may just need an export or re-export. |
| `src/desk/strategies/polymarket/cross-market-arb-v2.ts` | Non-v2 version exists. Would be created in Step 4 if top-5-performer. |
| `src/desk/strategies/polymarket/market-maker-v2.ts` | Non-v2 version exists. Would be created in Step 4 if top-5-performer. |
| `src/platform/api/routes/marketplace-listing-routes.ts` | Routes exist at different path. Consider adding a `/performance` endpoint to the existing route file instead. |

---

## 3. Existing Tests

| Test File | Relevance |
|-----------|-----------|
| `src/desk/backtesting/__tests__/backtest-runner.test.ts` | Tests `BacktestRunner` creation, unknown strategy error, cache clearing. Has P&L simulation tests for mock order manager. **Good base to extend.** |
| `src/desk/backtesting/__tests__/metrics-calculator.test.ts` | Tests metrics computation. |
| `src/desk/risk/__tests__/kelly-position-sizer.test.ts` | Tests Kelly calculation. |
| `src/desk/strategies/dna/__tests__/regime-detector.test.ts` | Tests `detectRegime()` output correctness. **Key test for understanding regime detector behavior.** |
| `src/desk/strategies/dna/__tests__/consensus-engine.test.ts` | Tests DNA consensus engine. |
| `src/desk/strategies/polymarket/__tests__/base-polymarket-strategy.test.ts` | Tests base strategy class. |
| `src/desk/polymarket/__tests__/strategy-runner.test.ts` | Tests the strategy runner which loads strategies from registry — indirectly references accuracy. |
| `src/platform/api/routes/__tests__/marketplace-strategy-listings-routes.test.ts` | Tests marketplace listing routes. **Good base for adding performance endpoint tests.** |
| `src/platform/marketplace/services/__tests__/` | Badge service tests directory exists but contents not inspected. |

### Tests specifically needed (NEW):

1. **`src/desk/signal/signal-fusion-accuracy.test.ts`** — Verify regime-aware weight shifts,
   accuracy-data-driven weight updates, reflection engine parameter tuning
2. **`src/desk/strategies/__tests__/strategy-backtest-integration.test.ts`** — End-to-end:
   accuracy change → weight update → reflected in next signal output

---

## 4. Specific Code Changes Needed

### Step 1: Regime-Adaptive Signal Fusion (Priority P1)

**`src/desk/intelligence/signal-fusion-engine.ts`:**
- Add import for `regime-detector.ts` (at `src/desk/strategies/dna/regime-detector.ts`)
- Add `detectRegime()` / `RegimeSnapshot`-aware overload or config to `fuseSignals()`
- Implement regime-adaptive weight multiplier logic:
  - Bull market: momentum strategies +20%, mean-reversion -10%
  - Bear market: mean-reversion +20%, momentum -10%
  - Sideways: range-bound +15%, trend-following -10%

**Risk:** `regime-detector.ts` is inside the DNA domain (`src/desk/strategies/dna/`). It exports
pure functions. Signal-fusion-engine is in `src/desk/intelligence/`. Check if cross-domain import
is acceptable per architectural rules (desk/ -> shared/ only). Since both are within `src/desk/`,
this is fine — desk modules can import other desk modules.

### Step 2: Prediction Accuracy Closed-Loop (Priority P1)

**`src/desk/intelligence/prediction-accuracy-tracker.ts`:**
- Add an export interface for accuracy data consumption (e.g., `AccuracyFeedback` with
  per-strategy win rates and trends over time)

**`src/desk/intelligence/reflection-engine.ts`** (NEW file):
- Accept accuracy data from tracker
- Adjust strategy parameters based on accuracy trend (not just snapshot)
- Add freshness decay: strategies below win rate threshold (<50%) get weight reduced;
  strategies above threshold get weight increased proportionally

**`src/desk/intelligence/signal-fusion-engine.ts`:**
- Wire tracker output into `updateWeights()`: use accuracy data to adjust weights dynamically

### Step 3: Backtest All 30+ V2 Strategies (Priority P1)

**`src/desk/backtesting/backtest-runner.ts`:**
- Add method or config to output standardized CSV format
- Ensure all columns match spec

**`scripts/run-all-backtests.ts`:**
- Already does most of Step 3. May need minor column alignment.
- Currently writes to `reports/backtest-results.csv`; spec wants `/tmp/backtest-results-YYYYMMDD.csv`
  then copy to `reports/`

### Step 4: Fill Top 5 Strategy Stubs (Priority P2)

- Create V2 versions of top-performing stubs if they are stubs (many are already V2)
- The phase file says "start with stub files in `src/desk/strategies/polymarket/`" but most files
  there are already real V2 implementations. Need to run backtests to identify actual stubs.

### Step 5: Publish Strategy Performance on Marketplace (Priority P2)

**`src/platform/api/routes/marketplace-strategy-listings-routes.ts`:**
- Add `GET /:id/performance` endpoint returning `StrategyPerformance` interface

**`badge-service.ts`:**
- Already uses real performance data. Verify backtest data feeds into the perf DB table.

---

## 5. Risks and Gotchas

### HIGH: Path Mismatches

The phase file references several paths that do not match the actual codebase. This will cause
confusion during implementation if not corrected:

| Phase file path | Actual path | Impact |
|----------------|-------------|--------|
| `src/desk/intelligence/dna/DnaEngine.ts` | `src/desk/strategies/dna/regime-detector.ts` | Regime detector functions are not a class called "DnaEngine" |
| `src/desk/execution/backtest-runner.ts` | `src/desk/backtesting/backtest-runner.ts` | Import paths in test files will break |
| `src/desk/execution/run-all-backtests.ts` | `scripts/run-all-backtests.ts` | Different module, different execution context |
| `src/desk/market-data/gamma-client.ts` | `src/desk/polymarket/gamma-client.ts` | Import path wrong |
| `src/platform/marketplace/api/marketplace-listing-routes.ts` | `src/platform/api/routes/marketplace-strategy-listings-routes.ts` | Different directory structure |
| `src/platform/marketplace/strategy-listing-service.ts` | Logic lives in `marketplace.service.ts` | No separate service file |

### HIGH: Synthetic Backtest Data

`GammaHistoricalProvider` generates SYNTHETIC price data via `Math.sin()` deterministic random walk,
not real historical data. The phase file identifies this risk. Backtest results will not be reliable
for performance ranking or strategy selection until real historical data is used. The comment in the
source says "For production, replace with a proper historical data store."

### MEDIUM: Strategy Count Mismatch

The phase file says "30+ V2 strategies" and "52 strategies." The strategy registry has 35 entries
(per `grep "name:"` count). Some entries are non-V2 (like `listing-arbitrage-sniper`) and many
strategies in the registry directory are NOT V2 suffixed but ARE registered. The actual count is
~35 registered strategies, not 30+ V2 or 52 total.

### MEDIUM: Regime Detector Not Exposed as Service

`regime-detector.ts` exports pure functions (`detectRegime()`). It is not wrapped as a service
or singleton. The signal-fusion-engine imports need to instantiate it with data, requiring
indicators data. This adds complexity — the fusion engine needs real-time indicator data to
call `detectRegime()`, which it currently does not have.

### MEDIUM: No Reflection Engine Anywhere

`reflection-engine.ts` does not exist. This is a significant new module to build (estimated 200-300
lines). It needs to accept accuracy data, tune strategy parameters, and handle freshness decay.

### LOW: Kelly Position Sizer Duplicate

Exists in both `src/desk/risk/` and `src/desk/polymarket/`. Need to ensure regime-aware sizing
changes are applied consistently or consolidated.

### LOW: Dashboard Component Path

`src/platform/dashboard/src/components/strategy-performance-card.tsx` is listed as NEW but the
dashboard is a different app. The phase file's path suggests it's under `src/platform/dashboard/`
which exists but has no `src/components/` subdirectory. The dashboard appears to be a single
`dashboard.html` file with embedded JS, not a React component tree. The performance card may
need a different approach (HTML template extension or new API endpoint).

### LOW: Badge Service Already Uses Real Data

The badge service already reads from a `marketplace_performance` DB table. The "update badge
criteria" step may be simpler than anticipated — the main work is piping backtest results into
the perf table, not changing badge logic.

---

## Summary Table

| Category | Count | Details |
|----------|-------|---------|
| Files exist at expected path | 4 | prediction-accuracy-tracker, signal-fusion-engine, base-polymarket-strategy, spread-mean-reversion-v2 |
| Files exist at DIFFERENT path | 5 | regime-detector, backtest-runner, run-all-backtests, gamma-client, marketplace routes |
| Files MISSING | 5 | reflection-engine, cross-market-arb-v2, market-maker-v2, base-strategy, strategy-listing-service |
| Files NEW per phase spec | 3 | strategy-backtest-integration.test.ts, signal-fusion-accuracy.test.ts, backtest-all-strategies.sh |
| Existing relevant tests | ~10 | backtest-runner, kelly, regime-detector, consensus-engine, marketplace routes (see section 3) |
| New tests needed | 2 | signal-fusion-accuracy, strategy-backtest-integration |

---

## Report Reference

- Report file: `/Users/macbook/algo-trader/plans/260703-1727-next-wave-III-brainstorm/reports/scout-track-b-trading-edge-loop.md`
- Phase file: `/Users/macbook/algo-trader/plans/260703-1727-next-wave-III-brainstorm/phase-b-trading-edge-feedback-loop.md`

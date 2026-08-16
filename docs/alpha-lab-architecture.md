# Alpha Lab Architecture

## Overview

Alpha Lab is a modular research layer that sits above the existing algo-trader backtest engine. It reuses `src/desk/backtesting/metrics-calculator.ts` rather than duplicating evaluation logic.

## Module Map

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `regimes/` | Regime classification | `classifyRegime` |
| `features/` | Feature extraction | `buildFeatureVector` |
| `labeling/` | Event labeling (TP/SL/timeout) | `batchLabel` |
| `experiments/` | Experiment orchestrator | `runExperiment` |
| `walkforward/` | Rolling walk-forward evaluation | `evaluateWalkForward` |
| `evaluation/` | Regime-aware evaluation | `evaluate` |
| `baselines/` | Benchmark strategies | `buyAndHold`, `randomEntry`, `simpleMomentum`, `simpleMeanReversion` |
| `attribution/` | Alpha verdict | `evaluateAlpha`, `survivalGate` |
| `reports/` | AI agent API | `runFullDiscovery` |

## Data Flow

```
Candles
  ├─► Regime Engine → RegimeSnapshot per bar
  ├─► Feature Pipeline → FeatureVector per bar
  ├─► Triple-Barrier Label → TP/SL/Timeout labels
  ├─► Experiment Engine → splits → labels → trades → metrics
  ├─► Walk-Forward → per-step results + summary
  ├─► Evaluation → regime/month/volatility breakdown
  ├─► Baselines → benchmark comparison
  └─► Alpha Verdict → PASS/FAIL
```

## Safety

- Paper/backtest ONLY. No live trading.
- All functions are causal: at timestamp T, only data at or before T is used.
- Fees and slippage applied to all trades.
- Promotion state machine enforces paper-only until survival gate passes.

## Key Invariants

1. `computeMetrics` is the single source of truth for PnL metrics.
2. `batchLabel` uses only future bars relative to entry (no look-ahead).
3. `classifyRegime` uses only candles at or before the timestamp.
4. `generateSplits` excludes `lookback` warmup bars from all windows.
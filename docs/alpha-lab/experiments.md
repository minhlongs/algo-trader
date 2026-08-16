# Experiments — Alpha Discovery

## Purpose

Experiment abstraction that captures every decision point for reproducibility. Each experiment produces structured artifacts for comparison and audit.

## Configuration

| Field | Description |
|-------|-------------|
| `experimentId` | Unique identifier |
| `hypothesis` | What the experiment tests |
| `symbol` | Market |
| `timeframe` | Candle interval |
| `features` | Feature set used |
| `regimes` | Regime filter ('all' or specific) |
| `tp` / `sl` | Take-profit / stop-loss thresholds |
| `maxHolding` | Timeout (bars) |
| `lookback` | Warmup period |
| `split` | Walk-forward config (rolling/expanding + ratios) |
| `cost` | Fee + slippage config |
| `seed` | Random seed for reproducibility |
| `gitCommit` | Code version |

## Cost Model

All experiments apply round-trip costs:

```
grossPnL = entry × tp  (win) or entry × sl (loss)
cost = entry × (feeBps + slippageBps) / 10000 × 2
netPnL = grossPnL − cost
```

## API

```typescript
import { runExperiment } from '@/alpha-lab/experiments/experiment-engine';

const result = runExperiment({
  candles,
  config: { /* ExperimentConfig */ },
});
// → { config, steps, metrics: { train, val, test }, totalBars, numSteps }
```

## Files

- `src/alpha-lab/experiments/experiment-engine.ts` — orchestrator
- `src/alpha-lab/experiments/experiment-types.ts` — types
- `src/alpha-lab/experiments/splitter.ts` — walk-forward splits
- `src/alpha-lab/experiments/alpha-backtest-adapter.ts` — integration with existing backtest engine
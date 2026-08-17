# Experiments — Alpha Discovery

## Purpose

Experiment abstraction that captures every decision point for reproducibility. Each experiment produces structured artifacts for comparison and audit.

## Configuration

| Field | Description |
|-------|-------------|
| `experimentId` | Unique identifier |
| `hypothesis` | What the experiment tests |
| `symbol` | Market (e.g. `BTC-USDT`) |
| `timeframe` | Candle interval (e.g. `1h`, `4h`) |
| `features` | Feature names from the registry |
| `regimes` | `'all'` or list of `MarketRegime` values |
| `tp` | Take-profit threshold (fraction) |
| `sl` | Stop-loss threshold (fraction) |
| `maxHolding` | Max bars to hold a position |
| `lookback` | Bars used for feature/regime computation |
| `split` | Walk-forward split config (mode, ratios, window sizes) |
| `cost` | Fee + slippage model (`feeBps`, `slippageBps`, `scenario`) |
| `seed` | Reproducibility seed |
| `gitCommit` | Commit hash at creation |
| `createdAt` | ISO-8601 timestamp |

## Initial Experiments

### 1. RSI Mean Reversion (`rsi-mean-reversion.json`)

- **Symbol:** BTC-USDT
- **Timeframe:** 1h
- **Features:** momentum, ma_distance, atr
- **Regimes:** RANGE
- **Hypothesis:** Momentum + MA distance capture overbought/oversold reversals in range-bound markets. TP 1.5%, SL 0.8%, max 12-bar hold.
- **Split:** Expanding 60/20/20

### 2. Volume Breakout (`volume-breakout.json`)

- **Symbol:** ETH-USDT
- **Timeframe:** 4h
- **Features:** volume_zscore, relative_volume, volume_momentum, breakout_state
- **Regimes:** TREND_UP, TREND_DOWN, HIGH_VOLATILITY
- **Hypothesis:** Volume anomaly + breakout state detect continuation moves in directional regimes. TP 3%, SL 1.5%, max 6-bar hold.
- **Split:** Expanding 60/20/20

### 3. Multi-Factor Momentum (`multi-factor-momentum.json`)

- **Symbol:** SOL-USDT
- **Timeframe:** 1h
- **Features:** simple_return, momentum, volume_zscore, relative_volume, atr
- **Regimes:** TREND_UP, TREND_DOWN
- **Hypothesis:** Combined price + volume factors capture trend continuation alpha. TP 2.5%, SL 1.2%, max 18-bar hold.
- **Split:** Rolling 60/20/20 (train window 500, val window 100)

## Adding a New Experiment

1. Create a JSON file in `src/alpha-lab/configs/` with a descriptive name.
2. Fill in all required fields per the schema above.
3. Choose features from the registry (run `pnpm tsx -e "import {listFeatures} from './src/alpha-lab/features/feature-registry'; console.log(listFeatures())"` to list).
4. Pick regimes that match your hypothesis.
5. Run: `pnpm tsx src/alpha-lab/run-experiment.ts --config src/alpha-lab/configs/<your-config>.json`
6. Verify the artifact JSON output has sensible metrics.
7. Add a test entry if needed (tests auto-discover all `.json` in `configs/`).

## Running Experiments

```bash
# Run a single experiment
pnpm tsx src/alpha-lab/run-experiment.ts --config src/alpha-lab/configs/rsi-mean-reversion.json

# Run all configs via tests
pnpm test -- --filter experiment-configs
```

## Usage

```typescript
import { runExperiment } from '@/alpha-lab/experiments/experiment-engine';

const result = runExperiment({
  candles,
  config: { /* ExperimentConfig */ },
});

console.log(result.metrics.test);
```

## Files

- `src/alpha-lab/configs/*.json` — experiment configuration files
- `src/alpha-lab/run-experiment.ts` — CLI runner
- `src/alpha-lab/experiments/experiment-engine.ts` — orchestrator
- `src/alpha-lab/experiments/experiment-types.ts` — types
- `src/alpha-lab/experiments/splitter.ts` — walk-forward splits
- `src/alpha-lab/experiments/alpha-backtest-adapter.ts` — integration with existing backtest engine

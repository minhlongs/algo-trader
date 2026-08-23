# Experiments

Every experiment is a frozen, reproducible snapshot. Same config + same data +
same seed = identical results.

## Location

`src/alpha-lab/experiments/experiment-engine.ts`
`src/alpha-lab/experiments/experiment-types.ts`
`src/alpha-lab/experiments/splitter.ts`
`src/alpha-lab/experiments/alpha-backtest-adapter.ts`

## Experiment Config

```jsonc
{
  "id": "momentum-breakout-v1",
  "hypothesis": "Breakout + volume confirmation predicts continuation",
  "symbol": "BTC/USDT",
  "timeframe": "1h",
  "features": ["returns", "realizedVol", "volumeZscore"],
  "regimeFilter": "all",
  "entryRule": "...",
  "exitRule": "...",
  "positionSizing": "fixed-fraction",
  "feeBps": 5,
  "slippageBps": 3,
  "trainPct": 0.6,
  "valPct": 0.2,
  "testPct": 0.2,
  "splitMode": "expanding",
  "numSteps": 5,
  "seed": 42
}
```

Configs live in `src/alpha-lab/configs/*.json`. Three ship by default:
`multi-factor-momentum.json`, `rsi-mean-reversion.json`, `volume-breakout.json`.

## Result

`runExperiment(input)` returns `ExperimentResult`:

| Field | Meaning |
|-------|---------|
| `config` | Frozen config snapshot |
| `steps` | Walk-forward steps generated |
| `metrics.train/val/test` | Per-split metrics |
| `totalBars` | Bars processed |
| `numSteps` | Walk-forward steps |

The config snapshot is deep-frozen at creation, so the result is auditable
even if the source config file changes later.

## Reproducibility

- `seed` controls the random-entry baseline and any stochastic components.
- The git commit hash is captured at run time.
- `alpha-backtest-adapter.ts` prefers real OHLCV data and falls back to mock
  data, which is **clearly labelled** in artifacts so results are never
  mistaken for out-of-sample evidence.

## Causal Boundary

Labels never use lookback-before-window data. The experiment engine
regression-tests this explicitly.

## CLI

```
algo-trader alpha backtest <experiment>
algo-trader alpha discover <symbol> --tf <timeframe>
```
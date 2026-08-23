# Alpha Lab

Modular research layer for the Alpha Discovery Engine. Produces
regime tags, feature vectors, and event labels — never trades or live
orders. All output is PAPER / BACKTEST ONLY.

## Location

```
src/alpha-lab/
├── attribution/        # survival gate, promotion state machine, alpha evaluator
├── baselines/          # buy-hold, random, momentum, mean-reversion baselines
├── check-gates.ts      # CLI entry: `npx tsx src/alpha-lab/check-gates.ts`
├── configs/            # experiment JSON configs (multi-factor-momentum, ...)
├── cost-model/         # NORMAL / CONSERVATIVE / ADVERSE cost stress presets
├── evaluation/         # evaluation-engine.ts — metrics by regime / month / vol bucket
├── experiments/        # experiment-engine.ts, splitter.ts, alpha-backtest-adapter.ts
├── features/           # price-features, volume-features, feature-registry
├── gates/              # gate-evaluator, gate-state, gate-types
├── labeling/           # triple-barrier.ts — TP / SL / TIMEOUT event labels
├── regimes/            # regime-engine.ts — deterministic causal classifier
├── reports/            # research-agent-api, hypothesis-generator, hypothesis-rules
├── run-experiment.ts   # programmatic experiment runner
├── shared/             # trade-builder.ts, equity-curve.ts
└── walkforward/        # walkforward-evaluator.ts — rolling train/val/test splits
```

## Core Principles

1. **No duplication.** The alpha-lab reuses `src/desk/backtesting/backtest-runner.ts`
   and `computeMetrics` from `src/desk/backtesting/metrics-calculator.ts`. It never
   reimplements the backtest engine.
2. **Causal only.** At timestamp T, a feature / label / regime tag may use only
   data available at or before T. Tests in `__tests__/` include explicit
   look-ahead-leakage regression checks.
3. **Deterministic.** Same config + same data + same seed = byte-identical result.
   No `Date.now()`, no `Math.random()` without an explicit seed parameter.
4. **Reproducible.** Every experiment freezes its config snapshot (including git
   commit hash) into the result artifact.

## Data Flow

```
OHLCV candles
  → regime-engine.ts        → regime tags per bar
  → feature-registry.ts    → feature matrix
  → triple-barrier.ts      → y labels (+1 TP / -1 SL / 0 timeout)
  → experiment-engine.ts   → train / val / test splits
  → trade-builder.ts       → BacktestTrade[] with return-on-capital PnL
  → evaluation-engine.ts   → metrics by regime / month / volatility bucket
  → survival-gate.ts       → PASS / KILLED verdict
  → hypothesis-generator.ts→ next-cycle hypotheses
```

## CLI

```
algo-trader alpha candidates                          # list configs + baselines
algo-trader alpha discover BTC/USDT --tf 1h           # rank all configs
algo-trader alpha backtest <experiment>               # run one config
algo-trader alpha walkforward <experiment>            # step-by-step WF
algo-trader alpha compare <a> <b>                     # side-by-side
algo-trader alpha report <experiment>                 # full breakdown
algo-trader alpha ablation <experiment>               # per-feature contribution
algo-trader alpha robustness <experiment>             # cost-stress survival
```

All commands accept `--json` and `--output <file>`.

## Safety

- No real orders are ever placed. The engine is PAPER / BACKTEST ONLY.
- A strategy is never declared profitable unless the code actually computes the
  result from real (or mock, clearly labelled) data.
- Every PnL figure includes fees and slippage. Gross PnL is never the primary
  result.
- Promotion stops at PAPER / SHADOW. No automatic LIVE promotion exists.

## Cost Stress Modes

See `docs/COST_MODEL.md`. Presets: NORMAL (5 bps), CONSERVATIVE (10 bps),
ADVERSE (20+ bps). The `robustness` command runs a strategy under all three and
reports whether the edge survives.

## Anti-Look-Ahead Protections

- `triple-barrier.ts` exits a position using only candles at or before the
  holding deadline — never future candles.
- `regime-engine.ts` and `feature-registry.ts` operate on a fixed lookback
  window ending at the current bar.
- `experiment-engine.ts` respects the causal boundary: labels never use
  lookback-before-window data (regression-tested).
- `walkforward-evaluator.ts` never optimizes on the final test period.
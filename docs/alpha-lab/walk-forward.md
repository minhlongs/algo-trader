# Walk-Forward Validation — Alpha Discovery

## Purpose

Rolling walk-forward evaluation. Splits data into sequential train → validate → test windows to measure out-of-sample performance without look-ahead bias.

## Modes

- **Rolling**: Fixed-size windows that advance by test size.
- **Expanding**: Train window grows by validation size each step.

## Metrics Reported

- In-sample (train) win rate
- Validation win rate
- Out-of-sample (test) win rate
- Overfit gap: `trainWinRate - testWinRate`
- Consistency score: fraction of steps where test win rate > 0.5
- Average and total test trades

## Causal Guarantee

Each step's metrics use only data within that step's window plus the explicit `lookback` warmup. No future-bar leakage across steps.

## API

```typescript
import { evaluateWalkForward } from '@/alpha-lab/walkforward/walkforward-evaluator';

const result = evaluateWalkForward({
  candles,
  config: {
    experimentId: 'wf-001',
    symbol: 'X',
    timeframe: '1h',
    tp: 0.02,
    sl: 0.01,
    maxHolding: 6,
    lookback: 5,
    split: { mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25 },
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
    // ...
  },
});
// → { steps: StepResult[], summary: WalkForwardSummary }
```

## Files

- `src/alpha-lab/walkforward/walkforward-evaluator.ts` — evaluator logic
- `src/alpha-lab/walkforward/walkforward-types.ts` — type definitions
- `src/alpha-lab/experiments/splitter.ts` — split generator
# Walk-Forward Validation

Rolling train → validate → test evaluation. Never optimizes on the final test
period — that is the whole point.

## Location

`src/alpha-lab/walkforward/walkforward-evaluator.ts`

## Split Modes

| Mode | Behavior |
|------|----------|
| `expanding` | Train window grows each step |
| `rolling` | Fixed-size train window rolls forward |

Each step produces three splits: **train**, **validate**, **test**. The test
split is always the most recent slice and is never touched during parameter
selection.

## Usage

```typescript
import { evaluateWalkForward } from './walkforward-evaluator';
import type { CandleLike } from '../regimes/regime-types';

const result = evaluateWalkForward({
  candles,
  config: experimentConfig,   // ExperimentConfig with trainPct/valPct/testPct
  numSteps: 5,                 // how many rolling windows
  seed: 42,
});
// result.steps[i].testMetrics — out-of-sample metrics for step i
// result.summary.overfitGap — trainWinRate - testWinRate
```

## Summary Metrics

| Metric | Meaning |
|--------|---------|
| `overfitGap` | trainWinRate − testWinRate. Positive = potential overfit. |
| `consistencyScore` | Fraction of test splits with win rate > 0.5 |
| `avgTestTrades` | Average trades per test split |
| `totalTestTrades` | Total out-of-sample trades across all steps |

## Reporting

The walk-forward result feeds `evaluation-engine.ts`, which breaks performance
down by **regime**, **calendar month**, and **volatility bucket**. A strategy
that wins only in one regime or one month is flagged, not celebrated.

## Anti-Overfitting

- Parameters are selected on the **validate** split, never the test split.
- The `overfitGap` metric exposes train/test divergence.
- `consistencyScore` rewards strategies that win across many independent test
  windows, not just one lucky slice.

## CLI

```
algo-trader alpha walkforward <experiment>
```
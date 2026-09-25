import { describe, it, expect } from 'vitest';
import { evaluateWalkForward } from '../../../../src/alpha-lab/walkforward/walkforward-evaluator';
import type { ExperimentConfig } from '../../../../src/alpha-lab/walkforward/experiments/experiment-types';
import type { CandleLike } from '../../../../src/alpha-lab/walkforward/regimes/regime-types';

function makeCandles(n: number, modifier?: (i: number, base: CandleLike) => CandleLike): CandleLike[] {
  return Array.from({ length: n }, (_, i) => {
    const base: CandleLike = {
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 50 + i,
    };
    return modifier ? modifier(i, base) : base;
  });
}

const baseConfig: ExperimentConfig = {
  experimentId: 'wf-leakage-test',
  hypothesis: 'causal leakage invariance',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  features: ['simple_return'],
  regimes: 'all',
  tp: 0.02,
  sl: 0.01,
  maxHolding: 6,
  lookback: 5,
  split: {
    mode: 'rolling',
    trainRatio: 0.5,
    valRatio: 0.25,
    testRatio: 0.25,
    trainWindowSize: 20,
    valWindowSize: 10,
    testWindowSize: 10,
  },
  cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  seed: 42,
  gitCommit: 'dev',
  createdAt: '2025-01-01T00:00:00Z',
};

describe('Walk-Forward Evaluator Causal Leakage Prevention', () => {
  it('trainMetrics in step 0 are strictly invariant to future candles added after trainSplit.endIdx', () => {
    // 50 candles dataset
    const candlesA = makeCandles(50);

    // 80 candles dataset where first 50 candles are identical, but bars 50-79 have huge price swings
    const candlesB = makeCandles(80, (i, base) => {
      if (i >= 45) {
        // Dramatic crash or surge in future bars
        return {
          ...base,
          open: base.open * 2,
          high: base.high * 2.5,
          low: base.low * 1.5,
          close: base.close * 2,
        };
      }
      return base;
    });

    const resA = evaluateWalkForward({ candles: candlesA, config: baseConfig });
    const resB = evaluateWalkForward({ candles: candlesB, config: baseConfig });

    // Step 0 train metrics must be IDENTICAL because train split [5, 25) only sees bars 0..24
    expect(resA.steps[0]!.trainMetrics.numTrades).toBe(resB.steps[0]!.trainMetrics.numTrades);
    expect(resA.steps[0]!.trainMetrics.winRate).toBe(resB.steps[0]!.trainMetrics.winRate);
    expect(resA.steps[0]!.trainMetrics.lossRate).toBe(resB.steps[0]!.trainMetrics.lossRate);
    expect(resA.steps[0]!.trainMetrics.totalPnl).toBe(resB.steps[0]!.trainMetrics.totalPnl);
  });

  it('no step metrics include trades whose entryIdx + maxHolding exceeds split.endIdx', () => {
    const candles = makeCandles(80);
    const result = evaluateWalkForward({ candles, config: baseConfig });

    // The maximum possible number of trades in a train window of size 20 with lookback 5 and maxHolding 6 is:
    // start = max(5, 5) = 5
    // end = 25 - 1 - 6 = 18
    // entries: 5..18 -> 14 trades
    expect(result.steps[0]!.trainMetrics.numTrades).toBeLessThanOrEqual(14);
  });
});

/**
 * Walk-Forward Evaluator
 *
 * Runs an experiment across walk-forward splits and aggregates results.
 *
 * Causal invariant: every step's metrics use only data within that step's window
 * plus the explicit `lookback` warmup. No future-bar leakage across steps.
 *
 * @see docs/ALPHA_DISCOVERY_ARCHCHITECTURE.md — "Foundation vs Integration Contract"
 */

import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import { computeRegimeSeries } from '../regimes/regime-series';
import type { ExperimentConfig } from '../experiments/experiment-types';
import { generateSplits } from '../experiments/splitter';
import type { WalkForwardResult, StepResult } from './walkforward-types';
import { buildStepResult } from './walkforward-step';
import { buildSummary } from './walkforward-summary';

export {
  splitMetricsFrom,
  stepMetrics,
  buildStepResult,
} from './walkforward-step';

export { buildSummary } from './walkforward-summary';

export interface EvaluateWalkForwardInput {
  candles: CandleLike[];
  config: ExperimentConfig;
}

/**
 * Evaluate a single experiment across all walk-forward steps.
 *
 * Returns per-step breakdown and aggregated summary metrics.
 *
 * Causal guarantee: each step's test metrics use only data up to that step's
 * test window end. No future leakage between steps.
 */
export function evaluateWalkForward(input: EvaluateWalkForwardInput): WalkForwardResult {
  const { candles, config } = input;

  if (candles.length === 0) throw new Error('Empty candle array');
  if (candles.length < config.lookback + config.maxHolding + 1) {
    throw new Error(
      `Insufficient data: need at least ${config.lookback + config.maxHolding + 1} bars, got ${candles.length}`,
    );
  }

  const rawSplits = generateSplits(config.split, candles.length, config.lookback);
  if (rawSplits.length === 0) {
    throw new Error('No splits generated — check config ratios vs data length');
  }

  type SplitItem = typeof rawSplits[0];
  const stepMap = new Map<number, { train?: SplitItem; val?: SplitItem; test?: SplitItem }>();
  for (const s of rawSplits) {
    const existing = stepMap.get(s.step) ?? {};
    if (!stepMap.has(s.step)) stepMap.set(s.step, existing);
    if (s.kind === 'train') existing.train = s;
    else if (s.kind === 'val') existing.val = s;
    else existing.test = s;
  }
  const steps = Array.from(stepMap.values()) as Array<{ train: SplitItem; val: SplitItem; test: SplitItem }>;
  const regimeSeries = computeRegimeSeries(candles, {
    market: config.symbol,
    timeframe: config.timeframe,
    lookback: config.lookback,
  });

  const stepResults: StepResult[] = steps.map((s, i) =>
    buildStepResult(candles, config, regimeSeries, i, s.train, s.val, s.test),
  );

  const allTestTrades = stepResults.flatMap((s) => s.testTrades ?? []);
  const testCandleMap = new Map<string, CandleLike>();
  for (const s of steps) {
    for (let i = s.test.startIdx; i < s.test.endIdx && i < candles.length; i++) {
      testCandleMap.set(candles[i].timestamp, candles[i]);
    }
  }
  const testCandles = Array.from(testCandleMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const summary = buildSummary(stepResults, allTestTrades, testCandles);
  return { steps: stepResults, summary, allTestTrades };
}

/**
 * Experiment Engine
 *
 * Integration layer: alpha-lab splits + triple-barrier labels feed the existing
 * metrics calculator (`src/desk/backtesting/metrics-calculator.ts`).
 *
 * Causal invariant: every label and metric uses only data within its split window
 * plus the explicit `lookback` warmup. No future-bar leakage.
 */

import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';
import { batchLabel } from '../labeling/triple-barrier';
import type { BacktestTrade } from '../../desk/backtesting/types';
import { buildTrades } from '../shared/trade-builder';
import type { ExperimentConfig, ExperimentResult, WalkForwardStep } from './experiment-types';
import { generateSplits } from './splitter';
import { computeSplitMetrics } from './split-metrics';
import { computeRegimeSeries, distinctRegimes } from '../regimes/regime-series';
import { writeRunCard, type ResultClassName, type DataSourceProvenance } from '../provenance/run-card';

export interface RunExperimentInput {
  candles: CandleLike[];
  config: ExperimentConfig;
  dataSources?: DataSourceProvenance[];
  runCardDir?: string;
  resultClass?: ResultClassName;
}

/**
 * Run a single experiment: generate splits → label → compute metrics.
 */
export function runExperiment(input: RunExperimentInput): ExperimentResult {
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

  const stepMap = new Map<number, Partial<WalkForwardStep> & { step: number }>();
  for (const s of rawSplits) {
    let existing = stepMap.get(s.step);
    if (!existing) {
      existing = { step: s.step };
      stepMap.set(s.step, existing);
    }
    if (s.kind === 'train') existing.train = s;
    else if (s.kind === 'val') existing.val = s;
    else existing.test = s;
  }
  const steps = Array.from(stepMap.values()) as WalkForwardStep[];

  const allTrainLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allValLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTestLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTrainTrades: BacktestTrade[] = [];
  const allValTrades: BacktestTrade[] = [];
  const allTestTrades: BacktestTrade[] = [];

  const candlePrices = candles.map((c) => ({ high: c.high, low: c.low, close: c.close }));
  const tradeOpts = { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps };

  for (const step of steps) {
    for (const [split, labelsArr, tradesArr] of [
      [step.train, allTrainLabels, allTrainTrades],
      [step.val, allValLabels, allValTrades],
      [step.test, allTestLabels, allTestTrades],
    ] as const) {
      const start = Math.max(split.startIdx, config.lookback);
      const end = split.endIdx - 1 - config.maxHolding;
      if (end >= start) {
        const labels = batchLabel(candlePrices, config.tp, config.sl, config.maxHolding, start, end);
        labelsArr.push(...labels);
        tradesArr.push(...buildTrades(candles, labels, tradeOpts));
      }
    }
  }

  const fullRange = { startIdx: 0, endIdx: candles.length };
  const regimeSeries = computeRegimeSeries(candles, {
    market: config.symbol,
    timeframe: config.timeframe,
    lookback: config.lookback,
  });
  const regimesForKind = (kind: 'train' | 'val' | 'test'): MarketRegime[] =>
    distinctRegimes(rawSplits
      .filter((s) => s.kind === kind)
      .flatMap((s) => regimeSeries.slice(s.startIdx, s.endIdx)));

  const metrics = {
    train: computeSplitMetrics({
      labels: allTrainLabels,
      trades: allTrainTrades,
      candles,
      regimesPresent: regimesForKind('train'),
      split: fullRange,
    }),
    val: computeSplitMetrics({
      labels: allValLabels,
      trades: allValTrades,
      candles,
      regimesPresent: regimesForKind('val'),
      split: fullRange,
    }),
    test: computeSplitMetrics({
      labels: allTestLabels,
      trades: allTestTrades,
      candles,
      regimesPresent: regimesForKind('test'),
      split: fullRange,
    }),
  };

  const result: ExperimentResult = {
    config,
    steps,
    metrics,
    totalBars: candles.length,
    numSteps: steps.length,
  };

  if (input.runCardDir) {
    void writeRunCard(input.runCardDir, {
      runId: config.experimentId,
      resultClass: input.resultClass ?? 'IS',
      strategyRef: config.features.join('+') || 'experiment',
      hypothesis: config.hypothesis,
      dataSources: input.dataSources ?? [],
      metrics: {
        trainSharpe: metrics.train.sharpeRatio,
        valSharpe: metrics.val.sharpeRatio,
        testSharpe: metrics.test.sharpeRatio,
        trainPnl: metrics.train.totalPnl,
        valPnl: metrics.val.totalPnl,
        testPnl: metrics.test.totalPnl,
        totalBars: candles.length,
        numSteps: steps.length,
      },
      config: config as unknown as Record<string, unknown>,
    });
  }

  return result;
}

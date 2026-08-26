/**
 * Experiment Engine
 *
 * Integration layer: alpha-lab splits + triple-barrier labels feed the existing
 * metrics calculator (`src/desk/backtesting/metrics-calculator.ts`).
 *
 * Causal invariant: every label and metric uses only data within its split window
 * plus the explicit `lookback` warmup. No future-bar leakage.
 * @see docs/ALPHA_DISCOVERY_ARCHITECTURE.md — "Foundation vs Integration Contract"
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
import { writeRunCard } from '../provenance/run-card';
import type { ResultClassName, DataSourceProvenance } from '../provenance/run-card';

// ── Public API ────────────────────────────────────────────────────────────────

export interface RunExperimentInput {
  candles: CandleLike[];
  config: ExperimentConfig;
  /**
   * Data source provenance for the candles used in this experiment.
   * When provided, this is written to the run card for full provenance.
   */
  dataSources?: DataSourceProvenance[];
  /**
   * Directory to write the provenance run card into. When set, a run card is
   * written (fail-safe) recording this experiment's config hash, result class,
   * and metrics. Omit to skip provenance — useful for pure unit tests.
   */
  runCardDir?: string;
  /**
   * Result class for the run card. Defaults to 'IS' (in-sample) — callers that
   * run on an out-of-sample window must pass 'OOS' explicitly so the card
   * cannot be mis-cited as in-sample evidence.
   */
  resultClass?: ResultClassName;
}

/**
 * Run a single experiment: generate splits → label → compute metrics.
 *
 * Returns a structured artifact capturing every decision point for reproducibility.
 */
export function runExperiment(input: RunExperimentInput): ExperimentResult {
  const { candles, config } = input;

  if (candles.length === 0) throw new Error('Empty candle array');
  if (candles.length < config.lookback + config.maxHolding + 1) {
    throw new Error(
      `Insufficient data: need at least ${config.lookback + config.maxHolding + 1} bars, got ${candles.length}`,
    );
  }

  // Generate walk-forward splits (causal boundaries enforced inside generateSplits).
  const rawSplits = generateSplits(config.split, candles.length, config.lookback);
  if (rawSplits.length === 0) {
    throw new Error('No splits generated — check config ratios vs data length');
  }

  // Group into steps.
  const stepMap = new Map<number, WalkForwardStep>();
  for (const s of rawSplits) {
    const existing = stepMap.get(s.step);
    if (!existing) {
      stepMap.set(s.step, { step: s.step, train: s, val: s, test: s });
    } else {
      if (s.kind === 'train') existing.train = s;
      else if (s.kind === 'val') existing.val = s;
      else existing.test = s;
    }
  }
  const steps = Array.from(stepMap.values()).sort((a, b) => a.step - b.step);

  // Aggregate labels + trades across all steps.
  const allTrainLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allValLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTestLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTrainTrades: BacktestTrade[] = [];
  const allValTrades: BacktestTrade[] = [];
  const allTestTrades: BacktestTrade[] = [];

  for (const step of steps) {
    // Train split.
    const trainStart = Math.max(step.train.startIdx, config.lookback);
    const trainEnd = step.train.endIdx - 1 - config.maxHolding;
    if (trainEnd >= trainStart) {
      const tLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        trainStart,
      );
      allTrainLabels.push(...tLabels);
      allTrainTrades.push(...buildTrades(candles, tLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }

    // Val split.
    const valStart = Math.max(step.val.startIdx, config.lookback);
    const valEnd = step.val.endIdx - 1 - config.maxHolding;
    if (valEnd >= valStart) {
      const vLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        valStart,
      );
      allValLabels.push(...vLabels);
      allValTrades.push(...buildTrades(candles, vLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }

    // Test split.
    const testStart = Math.max(step.test.startIdx, config.lookback);
    const testEnd = step.test.endIdx - 1 - config.maxHolding;
    if (testEnd >= testStart) {
      const teLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        testStart,
      );
      allTestLabels.push(...teLabels);
      allTestTrades.push(...buildTrades(candles, teLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }
  }

  // Aggregate labels + trades across ALL walk-forward steps, then compute one
  // equity curve over the full candle range. Regime attribution still reports
  // the union of distinct regimes across each split kind's own windows.
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

  // Provenance: fail-safe run card (never throws) records config hash + result class.
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
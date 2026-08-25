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
import { computeRegimeSeries, distinctRegimes } from '../regimes/regime-series';
import type { TripleBarrierResult } from '../labeling/triple-barrier';
import { batchLabel } from '../labeling/triple-barrier';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import type { ExperimentConfig } from '../experiments/experiment-types';
import { buildEquityCurve } from '../shared/equity-curve';
import { buildTrades } from '../shared/trade-builder';
import { generateSplits } from '../experiments/splitter';
import type { WalkForwardResult, StepResult, WalkForwardSummary } from './walkforward-types';
import type { SplitMetrics } from '../experiments/experiment-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Combine label-derived rates with report-derived PnL/risk metrics.
 *
 * All three rates (win/loss/timeout) come from labels so they share one
 * semantics with split-metrics.ts: a win is a TP-first exit (label === 1).
 * computeMetrics counts timeout exits (label === 0, pnl < 0) as losing
 * trades, conflating signal losses with timeouts, so its winRate is
 * intentionally NOT used here.
 *
 * The invariant winRate + lossRate + timeoutRate === 1 is guaranteed only
 * when the split has at least one label (n > 0). For an empty split (n === 0)
 * this path returns all three rates as 0, which differs from split-metrics.ts
 * (which reports timeoutRate: 1 for an empty split).
 */
function splitMetricsFrom(
  labels: Array<TripleBarrierResult & { entryIdx: number }>,
  report: ReturnType<typeof computeMetrics>,
  regimesPresent: MarketRegime[],
): SplitMetrics {
  const n = labels.length;
  const wins = labels.filter((l) => l.label === 1).length;
  const losses = labels.filter((l) => l.label === -1).length;
  const timeouts = labels.filter((l) => l.label === 0).length;
  return {
    numTrades: n,
    winRate: n > 0 ? wins / n : 0,
    lossRate: n > 0 ? losses / n : 0,
    timeoutRate: n > 0 ? timeouts / n : 0,
    meanLabel: n > 0 ? labels.reduce((s, l) => s + l.label, 0) / n : 0,
    regimesPresent,
    totalPnl: report.totalPnl,
    sharpeRatio: report.sharpeRatio,
    profitFactor: report.profitFactor,
    maxDrawdown: report.maxDrawdown,
  };
}

function stepMetrics(
  candles: CandleLike[],
  config: ExperimentConfig,
  split: { startIdx: number; endIdx: number },
): { labels: Array<TripleBarrierResult & { entryIdx: number }>; trades: BacktestTrade[] } {
  const start = Math.max(split.startIdx, config.lookback);
  const end = split.endIdx - 1 - config.maxHolding;
  if (end < start) return { labels: [], trades: [] };

  const closes = candles.map((c) => ({ high: c.high, low: c.low, close: c.close }));
  const labels = batchLabel(closes, config.tp, config.sl, config.maxHolding, start);
  const trades = buildTrades(candles, labels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps });
  return { labels, trades };
}

function buildStepResult(
  candles: CandleLike[],
  config: ExperimentConfig,
  regimeSeries: MarketRegime[],
  stepIdx: number,
  trainSplit: { startIdx: number; endIdx: number },
  valSplit: { startIdx: number; endIdx: number },
  testSplit: { startIdx: number; endIdx: number },
): StepResult {
  const { labels: tLabels, trades: tTrades } = stepMetrics(candles, config, trainSplit);
  const { labels: vLabels, trades: vTrades } = stepMetrics(candles, config, valSplit);
  const { labels: teLabels, trades: teTrades } = stepMetrics(candles, config, testSplit);

  const trainEquity = buildEquityCurve(candles.slice(trainSplit.startIdx, trainSplit.endIdx), tTrades);
  const valEquity = buildEquityCurve(candles.slice(valSplit.startIdx, valSplit.endIdx), vTrades);
  const testEquity = buildEquityCurve(candles.slice(testSplit.startIdx, testSplit.endIdx), teTrades);

  // Delegate to existing metrics calculator (proves reuse).
  const trainReport = computeMetrics(tTrades, trainEquity);
  const valReport = computeMetrics(vTrades, valEquity);
  const testReport = computeMetrics(teTrades, testEquity);

  // Win/loss/timeout rates are derived in splitMetricsFrom — labels are the
  // ground truth for what actually happened at each entry.
  const splitRegimes = (split: { startIdx: number; endIdx: number }): MarketRegime[] =>
    distinctRegimes(regimeSeries.slice(split.startIdx, split.endIdx));

  return {
    step: stepIdx,
    trainMetrics: splitMetricsFrom(tLabels, trainReport, splitRegimes(trainSplit)),
    valMetrics: splitMetricsFrom(vLabels, valReport, splitRegimes(valSplit)),
    testMetrics: splitMetricsFrom(teLabels, testReport, splitRegimes(testSplit)),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

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

  // Group into steps.
  const stepMap = new Map<number, { train: typeof rawSplits[0]; val: typeof rawSplits[0]; test: typeof rawSplits[0] }>();
  for (const s of rawSplits) {
    const existing = stepMap.get(s.step);
    if (!existing) {
      stepMap.set(s.step, { train: s, val: s, test: s });
    } else {
      if (s.kind === 'train') existing.train = s;
      else if (s.kind === 'val') existing.val = s;
      else existing.test = s;
    }
  }
  const steps = Array.from(stepMap.values()).sort((a, b) => a.test.step - b.test.step);
  const regimeSeries = computeRegimeSeries(candles, {
    market: config.symbol,
    timeframe: config.timeframe,
    lookback: config.lookback,
  });

  const stepResults: StepResult[] = steps.map((s, i) =>
    buildStepResult(candles, config, regimeSeries, i, s.train, s.val, s.test),
  );

  const summary = buildSummary(stepResults);
  return { steps: stepResults, summary };
}

function buildSummary(steps: StepResult[]): WalkForwardSummary {
  if (steps.length === 0) {
    return {
      totalSteps: 0,
      trainWinRate: 0,
      valWinRate: 0,
      testWinRate: 0,
      overfitGap: 0,
      consistencyScore: 0,
      avgTestTrades: 0,
      totalTestTrades: 0,
    };
  }

  const trainWR = steps.reduce((s, x) => s + x.trainMetrics.winRate, 0) / steps.length;
  const valWR = steps.reduce((s, x) => s + x.valMetrics.winRate, 0) / steps.length;
  const testWR = steps.reduce((s, x) => s + x.testMetrics.winRate, 0) / steps.length;
  const overfit = trainWR - testWR;
  const consistency = steps.filter((x) => x.testMetrics.winRate > 0.5).length / steps.length;
  const avgTrades = steps.reduce((s, x) => s + x.testMetrics.numTrades, 0) / steps.length;
  const totalTrades = steps.reduce((s, x) => s + x.testMetrics.numTrades, 0);

  return {
    totalSteps: steps.length,
    trainWinRate: trainWR,
    valWinRate: valWR,
    testWinRate: testWR,
    overfitGap: overfit,
    consistencyScore: consistency,
    avgTestTrades: avgTrades,
    totalTestTrades: totalTrades,
  };
}
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

import type { CandleLike } from '../regimes/regime-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';
import { batchLabel } from '../labeling/triple-barrier';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import type { ExperimentConfig } from '../experiments/experiment-types';
import { generateSplits } from '../experiments/splitter';
import type { WalkForwardResult, StepResult, WalkForwardSummary } from './walkforward-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTrades(
  candles: CandleLike[],
  labels: Array<TripleBarrierResult & { entryIdx: number }>,
  config: { tp: number; sl: number; feeBps: number; slippageBps: number },
): BacktestTrade[] {
  const feeMultiplier = config.feeBps / 10000;
  const slipMultiplier = config.slippageBps / 10000;
  const roundTripCost = feeMultiplier + slipMultiplier; // per side; round-trip = 2x

  return labels.map((l) => {
    const entryPrice = candles[l.entryIdx].close;
    const isWin = l.label === 1;
    const isLoss = l.label === -1;
    const grossPnL = isWin
      ? entryPrice * config.tp
      : isLoss
        ? -entryPrice * config.sl
        : 0;
    const cost = entryPrice * roundTripCost * 2; // round-trip: entry + exit
    const netPnL = grossPnL - cost;
    const exitPrice =
      isWin
        ? entryPrice * (1 + config.tp)
        : isLoss
          ? entryPrice * (1 - config.sl)
          : entryPrice;
    return {
      timestamp: candles[l.entryIdx].timestamp,
      tokenId: '',
      side: 'BUY',
      price: exitPrice,
      size: 1,
      pnl: netPnL,
    };
  });
}

function buildEquityCurve(
  candles: CandleLike[],
  start: number,
  end: number,
): Array<{ timestamp: string; equity: number }> {
  return candles.slice(start, end).map((c) => ({ timestamp: c.timestamp, equity: c.close }));
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
  stepIdx: number,
  trainSplit: { startIdx: number; endIdx: number },
  valSplit: { startIdx: number; endIdx: number },
  testSplit: { startIdx: number; endIdx: number },
): StepResult {
  const { labels: tLabels, trades: tTrades } = stepMetrics(candles, config, trainSplit);
  const { labels: vLabels, trades: vTrades } = stepMetrics(candles, config, valSplit);
  const { labels: teLabels, trades: teTrades } = stepMetrics(candles, config, testSplit);

  const trainEquity = buildEquityCurve(candles, trainSplit.startIdx, trainSplit.endIdx);
  const valEquity = buildEquityCurve(candles, valSplit.startIdx, valSplit.endIdx);
  const testEquity = buildEquityCurve(candles, testSplit.startIdx, testSplit.endIdx);

  // Delegate to existing metrics calculator (proves reuse).
  const trainReport = computeMetrics(tTrades, trainEquity);
  const valReport = computeMetrics(vTrades, valEquity);
  const testReport = computeMetrics(teTrades, testEquity);

  return {
    step: stepIdx,
    trainMetrics: {
      numTrades: tLabels.length,
      winRate: trainReport.winRate,
      lossRate: trainReport.losingTrades / Math.max(1, trainReport.totalTrades),
      timeoutRate: 0,
      meanLabel: tLabels.length > 0 ? tLabels.reduce((s, l) => s + l.label, 0) / tLabels.length : 0,
      regimesPresent: [],
    },
    valMetrics: {
      numTrades: vLabels.length,
      winRate: valReport.winRate,
      lossRate: valReport.losingTrades / Math.max(1, valReport.totalTrades),
      timeoutRate: 0,
      meanLabel: vLabels.length > 0 ? vLabels.reduce((s, l) => s + l.label, 0) / vLabels.length : 0,
      regimesPresent: [],
    },
    testMetrics: {
      numTrades: teLabels.length,
      winRate: testReport.winRate,
      lossRate: testReport.losingTrades / Math.max(1, testReport.totalTrades),
      timeoutRate: 0,
      meanLabel: teLabels.length > 0 ? teLabels.reduce((s, l) => s + l.label, 0) / teLabels.length : 0,
      regimesPresent: [],
    },
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

  const stepResults: StepResult[] = steps.map((s, i) =>
    buildStepResult(candles, config, i, s.train, s.val, s.test),
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
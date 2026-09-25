/**
 * Walk-Forward Step Execution & Metrics Generation
 */

import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import { distinctRegimes } from '../regimes/regime-series';
import type { TripleBarrierResult } from '../labeling/triple-barrier';
import { batchLabel } from '../labeling/triple-barrier';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import type { ExperimentConfig, SplitMetrics } from '../experiments/experiment-types';
import { buildEquityCurve } from '../shared/equity-curve';
import { buildTrades } from '../shared/trade-builder';
import type { StepResult } from './walkforward-types';

/**
 * Combine label-derived rates with report-derived PnL/risk metrics.
 */
export function splitMetricsFrom(
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

export function stepMetrics(
  candles: CandleLike[],
  config: ExperimentConfig,
  split: { startIdx: number; endIdx: number },
): { labels: Array<TripleBarrierResult & { entryIdx: number }>; trades: BacktestTrade[] } {
  const start = Math.max(split.startIdx, config.lookback);
  const end = split.endIdx - 1 - config.maxHolding;
  if (end < start) return { labels: [], trades: [] };

  const splitCandles = candles.slice(0, split.endIdx);
  const closes = splitCandles.map((c) => ({ high: c.high, low: c.low, close: c.close }));
  const labels = batchLabel(closes, config.tp, config.sl, config.maxHolding, start);
  const trades = buildTrades(splitCandles, labels, {
    tp: config.tp,
    sl: config.sl,
    feeBps: config.cost.feeBps,
    slippageBps: config.cost.slippageBps,
  });
  return { labels, trades };
}

export function buildStepResult(
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

  const testTradesWithRegime: BacktestTrade[] = teTrades.map((t, idx) => ({
    ...t,
    tokenId: regimeSeries[teLabels[idx].entryIdx] ?? t.tokenId,
  }));

  const trainEquity = buildEquityCurve(candles.slice(trainSplit.startIdx, trainSplit.endIdx), tTrades);
  const valEquity = buildEquityCurve(candles.slice(valSplit.startIdx, valSplit.endIdx), vTrades);
  const testEquity = buildEquityCurve(candles.slice(testSplit.startIdx, testSplit.endIdx), testTradesWithRegime);

  // Delegate to existing metrics calculator (proves reuse).
  const trainReport = computeMetrics(tTrades, trainEquity);
  const valReport = computeMetrics(vTrades, valEquity);
  const testReport = computeMetrics(testTradesWithRegime, testEquity);

  const splitRegimes = (split: { startIdx: number; endIdx: number }): MarketRegime[] =>
    distinctRegimes(regimeSeries.slice(split.startIdx, split.endIdx));

  return {
    step: stepIdx,
    trainMetrics: splitMetricsFrom(tLabels, trainReport, splitRegimes(trainSplit)),
    valMetrics: splitMetricsFrom(vLabels, valReport, splitRegimes(valSplit)),
    testMetrics: splitMetricsFrom(teLabels, testReport, splitRegimes(testSplit)),
    testTrades: testTradesWithRegime,
  };
}

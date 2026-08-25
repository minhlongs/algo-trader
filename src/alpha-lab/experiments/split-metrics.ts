import type { TripleBarrierResult } from '../labeling/triple-barrier';
import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import { buildEquityCurve } from '../shared/equity-curve';
import type { SplitMetrics } from './experiment-types';

export interface ComputeSplitMetricsInput {
  labels: Array<TripleBarrierResult & { entryIdx: number }>;
  trades: BacktestTrade[];
  candles: CandleLike[];
  regimesPresent: MarketRegime[];
  split: { startIdx: number; endIdx: number };
}

export function computeSplitMetrics(input: ComputeSplitMetricsInput): SplitMetrics {
  const { labels, trades, candles, regimesPresent, split } = input;

  if (labels.length === 0) {
    return {
      numTrades: 0,
      winRate: 0,
      lossRate: 0,
      timeoutRate: 1,
      meanLabel: 0,
      regimesPresent,
      totalPnl: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    };
  }

  const wins = labels.filter((l) => l.label === 1).length;
  const losses = labels.filter((l) => l.label === -1).length;
  const timeouts = labels.filter((l) => l.label === 0).length;
  const equity = buildEquityCurve(candles.slice(split.startIdx, split.endIdx), trades);
  const report = computeMetrics(trades, equity);

  return {
    numTrades: labels.length,
    winRate: wins / labels.length,
    lossRate: losses / labels.length,
    timeoutRate: timeouts / labels.length,
    meanLabel: labels.reduce((s, l) => s + l.label, 0) / labels.length,
    regimesPresent,
    totalPnl: report.totalPnl,
    sharpeRatio: report.sharpeRatio,
    profitFactor: report.profitFactor,
    maxDrawdown: report.maxDrawdown,
  };
}

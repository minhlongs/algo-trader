/**
 * Evaluation Engine
 *
 * Builds a regime-aware evaluation report from trades + regime snapshots +
 * candle history. Delegates overall metrics computation to the existing
 * computeMetrics (proves reuse).
 */

import type { MarketRegime, CandleLike } from '../regimes/regime-types';
import type { WalkForwardStep } from '../experiments/experiment-types';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import { buildEquityCurve } from '../shared/equity-curve';
import type { EvaluationReport } from './evaluation-types';
import {
  type GroupData,
  buildRegimeBreakdown,
  buildMonthBreakdown,
  buildVolatilityBreakdown,
} from './evaluation-bucket-builders';

export function realizedVol(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  const logRet: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (prev <= 0 || curr <= 0) return null;
    logRet.push(Math.log(curr / prev));
  }
  const mean = logRet.reduce((a, b) => a + b, 0) / logRet.length;
  const variance = logRet.reduce((s, r) => s + (r - mean) ** 2, 0) / logRet.length;
  return Math.sqrt(variance);
}

function monthKey(ts: string): string {
  return ts.slice(0, 7); // "YYYY-MM"
}

export function volBucket(vol: number | null): 'low' | 'medium' | 'high' {
  if (vol === null) return 'medium';
  if (vol < 0.01) return 'low';
  if (vol > 0.03) return 'high';
  return 'medium';
}

export interface EvaluateInput {
  candles: CandleLike[];
  trades: BacktestTrade[];
  labels: Array<{ label: 1 | -1 | 0 } & { entryIdx: number }>;
  steps: WalkForwardStep[];
  /** Regime for each bar in the candle array (indexed by bar position). */
  regimesPerBar: MarketRegime[];
}

export function evaluate(input: EvaluateInput): EvaluationReport {
  const { candles, trades, labels, steps: _steps, regimesPerBar } = input;

  if (trades.length === 0) {
    return {
      overall: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        lossRate: 0,
        profitFactor: 0,
        avgPnlPerTrade: 0,
        totalNetPnl: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
      },
      byRegime: [],
      byMonth: [],
      byVolatilityBucket: [],
    };
  }

  const equity = buildEquityCurve(candles, trades);
  const report = computeMetrics(trades, equity);

  const overallVol = realizedVol(candles);
  const bucket = volBucket(overallVol);

  const regimeGroups = new Map<MarketRegime, GroupData>();
  const monthGroups = new Map<string, GroupData>();
  const volGroups = new Map<string, GroupData>();

  volGroups.set(bucket, { labels: [], pnls: [] });

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i]!;
    const label = labels[i];
    const entryIdx = label?.entryIdx ?? 0;
    const regime = regimesPerBar[entryIdx] ?? 'UNKNOWN';
    const month = monthKey(trade.timestamp);

    if (!regimeGroups.has(regime)) regimeGroups.set(regime, { labels: [], pnls: [] });
    regimeGroups.get(regime)!.labels.push(trade.pnl! > 0 ? 1 : trade.pnl! < 0 ? -1 : 0);
    regimeGroups.get(regime)!.pnls.push(trade.pnl ?? 0);

    if (!monthGroups.has(month)) monthGroups.set(month, { labels: [], pnls: [] });
    monthGroups.get(month)!.labels.push(trade.pnl! > 0 ? 1 : trade.pnl! < 0 ? -1 : 0);
    monthGroups.get(month)!.pnls.push(trade.pnl ?? 0);

    volGroups.get(bucket)!.labels.push(trade.pnl! > 0 ? 1 : trade.pnl! < 0 ? -1 : 0);
    volGroups.get(bucket)!.pnls.push(trade.pnl ?? 0);
  }

  return {
    overall: {
      totalTrades: report.totalTrades,
      winningTrades: report.winningTrades,
      losingTrades: report.losingTrades,
      winRate: report.winRate,
      lossRate: report.losingTrades / Math.max(1, report.totalTrades),
      profitFactor: report.profitFactor,
      avgPnlPerTrade: report.avgPnlPerTrade,
      totalNetPnl: report.totalPnl,
      maxDrawdown: report.maxDrawdown,
      sharpeRatio: report.sharpeRatio,
    },
    byRegime: buildRegimeBreakdown(regimeGroups),
    byMonth: buildMonthBreakdown(monthGroups),
    byVolatilityBucket: buildVolatilityBreakdown(volGroups),
  };
}

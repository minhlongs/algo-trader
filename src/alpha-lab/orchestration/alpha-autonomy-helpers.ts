/**
 * Alpha Lab Autonomy Cycle, Metrics & Baseline Candle Helpers
 */

import type { CandleLike } from '../regimes/regime-types';
import type { PromotionCriteria } from './alpha-autonomy-types';

export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minSharpe: 1.5,
  minProfitFactor: 1.3,
  maxDrawdownPct: 0.20,
  minWinRate: 0.50,
  minTradeCount: 10,
};

export interface BoundedAutonomyMetricsSummary {
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
}

export function computeBoundedAutonomyMetrics(returns: number[]): BoundedAutonomyMetricsSummary {
  if (!returns || returns.length === 0) {
    return { profitFactor: 1.0, sharpeRatio: 0.0, maxDrawdownPct: 0.0, winRate: 0.0, tradeCount: 0 };
  }

  const gains = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0).map((r) => Math.abs(r));
  const sumGains = gains.reduce((sum, g) => sum + g, 0);
  const sumLosses = losses.reduce((sum, l) => sum + l, 0);

  const profitFactor =
    sumLosses === 0
      ? sumGains > 0
        ? 100.0
        : 1.0
      : Math.min(100.0, Math.max(0.0, sumGains / sumLosses));

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  let sharpeRatio = 0.0;
  if (stdDev > 0 && returns.length > 1) {
    const rawSharpe = (mean / stdDev) * Math.sqrt(252);
    sharpeRatio = Math.min(50.0, Math.max(-50.0, rawSharpe));
  }

  let equity = 1.0;
  let peak = 1.0;
  let maxDd = 0.0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    profitFactor,
    sharpeRatio,
    maxDrawdownPct: Math.min(1.0, Math.max(0.0, maxDd)),
    winRate: returns.length > 0 ? gains.length / returns.length : 0.0,
    tradeCount: returns.length,
  };
}

export function evaluatePromotionGate(
  metrics: BoundedAutonomyMetricsSummary,
  criteria: PromotionCriteria,
): boolean {
  return (
    metrics.sharpeRatio >= criteria.minSharpe &&
    metrics.profitFactor >= criteria.minProfitFactor &&
    metrics.maxDrawdownPct <= criteria.maxDrawdownPct &&
    metrics.winRate >= criteria.minWinRate &&
    metrics.tradeCount >= criteria.minTradeCount
  );
}

export function generateBaselineAutonomyCandles(now = Date.now()): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = 65000;
  for (let i = 0; i < 50; i++) {
    const delta = (Math.sin(i / 3) * 0.015 + 0.002) * price;
    price += delta;
    candles.push({
      timestamp: new Date(now - (50 - i) * 3600_000).toISOString(),
      open: price - delta * 0.5,
      high: price + Math.abs(delta) * 0.8,
      low: price - Math.abs(delta) * 0.8,
      close: price,
      volume: 100 + i * 5,
    });
  }
  return candles;
}

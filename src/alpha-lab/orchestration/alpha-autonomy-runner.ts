/**
 * Alpha Lab Autonomy Runner
 *
 * Evaluates candidate strategies using triple-barrier labeling with bounded
 * performance metrics (Sharpe <= 50, Profit Factor <= 100, zero division by zero).
 */

import { logger } from '../../shared/utils/logger';
import { tripleBarrierLabel } from '../labeling/triple-barrier';
import type { CandleLike } from '../regimes/regime-types';
import type {
  PromotionCriteria,
  AutonomyMetrics,
  AutonomyEvaluationOptions,
} from './alpha-autonomy-types';

const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minSharpe: 1.5,
  minProfitFactor: 1.3,
  maxDrawdownPct: 0.20,
  minWinRate: 0.50,
  minTradeCount: 10,
};

export class AlphaAutonomyRunner {
  public calculateBoundedMetrics(returns: number[]): {
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    tradeCount: number;
  } {
    if (!returns || returns.length === 0) {
      return { profitFactor: 1.0, sharpeRatio: 0.0, maxDrawdownPct: 0.0, winRate: 0.0, tradeCount: 0 };
    }

    const gains = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0).map(r => Math.abs(r));
    const sumGains = gains.reduce((sum, g) => sum + g, 0);
    const sumLosses = losses.reduce((sum, l) => sum + l, 0);

    let profitFactor: number;
    if (sumLosses === 0) {
      profitFactor = sumGains > 0 ? 100.0 : 1.0;
    } else {
      profitFactor = Math.min(100.0, Math.max(0.0, sumGains / sumLosses));
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.length > 1
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
      equity *= (1 + r);
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

  public runTripleBarrierScan(
    candles: CandleLike[],
    tpPct = 0.02,
    slPct = 0.01,
    maxHolding = 6,
  ): number[] {
    if (candles.length <= maxHolding + 1) return [];
    const formatted = candles.map(c => ({ high: c.high, low: c.low, close: c.close }));
    const returns: number[] = [];

    const limit = formatted.length - maxHolding - 1;
    for (let i = 0; i < limit; i += 2) {
      try {
        const result = tripleBarrierLabel(formatted, i, tpPct, slPct, maxHolding);
        if (result.label === 1) {
          returns.push(tpPct);
        } else if (result.label === -1) {
          returns.push(-slPct);
        } else {
          const entry = formatted[i]!.close;
          const exit = formatted[result.triggeredAt]!.close;
          returns.push(entry > 0 ? (exit - entry) / entry : 0);
        }
      } catch {
        // Skip invalid bar slices
      }
    }
    return returns;
  }

  public async runEvaluationCycle(options: AutonomyEvaluationOptions = {}): Promise<AutonomyMetrics> {
    const strategyId = options.strategyId ?? 'alpha-candidate-default';
    const criteria: PromotionCriteria = { ...DEFAULT_PROMOTION_CRITERIA, ...options.criteria };
    const candles = options.candles ?? this.generateBaselineCandles();

    const returns = this.runTripleBarrierScan(
      candles,
      options.tpPct ?? 0.02,
      options.slPct ?? 0.01,
      options.maxHoldingBars ?? 6,
    );

    const metrics = this.calculateBoundedMetrics(returns);
    const promoted =
      metrics.sharpeRatio >= criteria.minSharpe &&
      metrics.profitFactor >= criteria.minProfitFactor &&
      metrics.maxDrawdownPct <= criteria.maxDrawdownPct &&
      metrics.winRate >= criteria.minWinRate &&
      metrics.tradeCount >= criteria.minTradeCount;

    const result: AutonomyMetrics = {
      jobId: `job-${Date.now()}`,
      strategyId,
      profitFactor: metrics.profitFactor,
      sharpeRatio: metrics.sharpeRatio,
      maxDrawdownPct: metrics.maxDrawdownPct,
      winRate: metrics.winRate,
      tradeCount: metrics.tradeCount,
      labelsEvaluated: returns.length,
      promoted,
      executedAt: Date.now(),
    };

    logger.info('Alpha autonomy evaluation cycle finished', {
      strategyId,
      promoted,
      sharpe: result.sharpeRatio,
      pf: result.profitFactor,
    });
    return result;
  }

  private generateBaselineCandles(): CandleLike[] {
    const candles: CandleLike[] = [];
    let price = 65000;
    const now = Date.now();
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
}

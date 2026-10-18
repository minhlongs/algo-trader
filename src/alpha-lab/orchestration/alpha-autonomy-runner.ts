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

import {
  DEFAULT_PROMOTION_CRITERIA,
  type BoundedAutonomyMetricsSummary,
  computeBoundedAutonomyMetrics,
  evaluatePromotionGate,
  generateBaselineAutonomyCandles,
} from './alpha-autonomy-helpers';

export {
  DEFAULT_PROMOTION_CRITERIA,
  type BoundedAutonomyMetricsSummary,
  computeBoundedAutonomyMetrics,
  evaluatePromotionGate,
  generateBaselineAutonomyCandles,
};

export class AlphaAutonomyRunner {
  public calculateBoundedMetrics(returns: number[]): BoundedAutonomyMetricsSummary {
    return computeBoundedAutonomyMetrics(returns);
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
    const promoted = evaluatePromotionGate(metrics, criteria);

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
      strategyId, promoted, sharpe: result.sharpeRatio, pf: result.profitFactor,
    });
    return result;
  }

  private generateBaselineCandles(): CandleLike[] {
    return generateBaselineAutonomyCandles();
  }
}

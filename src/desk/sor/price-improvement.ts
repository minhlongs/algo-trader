import { OrderSide, RoutingPlan } from './sor-types';

export interface PriceImprovementResult {
  savingsUsd: number;
  improvementBps: number;
  isImprovementValid: boolean;
  benchmarkCostUsd: number;
  sorCostUsd: number;
}

export class PriceImprovementVerifier {
  public static readonly EPSILON = 1e-6;

  /**
   * Verifies that SOR cost satisfies the mathematical guarantee:
   * BUY: Cost_SOR <= Cost_naive + EPSILON
   * SELL: Proceeds_SOR >= Proceeds_naive - EPSILON
   */
  public verify(sorCostOrProceeds: number, naiveCostOrProceeds: number, side: OrderSide): boolean {
    if (side === 'BUY') {
      return sorCostOrProceeds <= naiveCostOrProceeds + PriceImprovementVerifier.EPSILON;
    }
    return sorCostOrProceeds >= naiveCostOrProceeds - PriceImprovementVerifier.EPSILON;
  }

  public calculatePriceImprovement(
    sorProceedsOrCost: number,
    naiveProceedsOrCost: number,
    side: OrderSide
  ): PriceImprovementResult {
    const isBuy = side === 'BUY';
    const isImprovementValid = this.verify(sorProceedsOrCost, naiveProceedsOrCost, side);

    const savingsUsd = isBuy
      ? Math.max(0, naiveProceedsOrCost - sorProceedsOrCost)
      : Math.max(0, sorProceedsOrCost - naiveProceedsOrCost);

    const benchmark = Math.abs(naiveProceedsOrCost);
    const improvementBps = benchmark > 0
      ? Number(((savingsUsd / benchmark) * 10000).toFixed(2))
      : 0;

    return {
      savingsUsd: Number(savingsUsd.toFixed(4)),
      improvementBps,
      isImprovementValid,
      benchmarkCostUsd: naiveProceedsOrCost,
      sorCostUsd: sorProceedsOrCost,
    };
  }

  public evaluatePlan(plan: RoutingPlan, naiveBenchmarkUsd?: number): PriceImprovementResult {
    const benchmark = naiveBenchmarkUsd ?? plan.naiveTotalCostUsd ?? plan.expectedNetProceedsUsd;
    return this.calculatePriceImprovement(plan.expectedNetProceedsUsd, benchmark, plan.side);
  }
}

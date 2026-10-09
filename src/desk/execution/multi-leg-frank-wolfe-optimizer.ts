/**
 * Frank-Wolfe Multi-Leg Execution Optimizer
 * Iterative gradient-based optimizer for minimizing total execution cost
 * across a multi-leg arbitrage basket (slippage + fees + timing risk).
 */

import logger from '../../shared/utils/logger';
import { MultiLegBasket } from '../../shared/types/ilp-types';
import {
  LegAllocation,
  FrankWolfeConfig,
  FrankWolfeResult,
  DEFAULT_FW_CONFIG,
  legCost,
  computeGradient,
  linearMinimizationOracle,
} from './frank-wolfe-cost-model';

export type { LegAllocation, FrankWolfeConfig, FrankWolfeResult };
export { DEFAULT_FW_CONFIG };

/**
 * Run Frank-Wolfe optimization over a multi-leg basket.
 * Returns optimal allocation that minimizes total execution cost.
 */
export function optimizeBasketExecution(
  basket: MultiLegBasket,
  liquidities: number[],
  config: Partial<FrankWolfeConfig> = {}
): FrankWolfeResult {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_FW_CONFIG, ...config };
  const positions = basket.positions;
  const n = positions.length;

  if (n === 0) {
    return {
      allocations: [],
      totalCost: 0,
      naiveCost: 0,
      costReductionFraction: 0,
      iterationsUsed: 0,
      converged: true,
      optimizationTimeMs: 0,
    };
  }

  const totalBudget = basket.totalCost;
  const liq = liquidities.length === n ? liquidities : new Array(n).fill(1000);

  let fractions = new Array(n).fill(1 / n);
  let prevCost = Infinity;
  let iter = 0;
  let converged = false;

  for (iter = 0; iter < cfg.maxIterations; iter++) {
    const gradient = computeGradient(fractions, positions, liq, totalBudget, cfg);
    const s = linearMinimizationOracle(gradient);
    const gamma = cfg.stepSizeBase / (iter + cfg.stepSizeDenom);
    const newFractions = fractions.map((f, i) => f + gamma * (s[i] - f));

    const totalCost = newFractions.reduce((sum, f, i) => {
      return sum + legCost(positions[i], f * totalBudget, liq[i], cfg);
    }, 0);

    fractions = newFractions;

    const improvement = Math.abs(prevCost - totalCost);
    if (improvement < cfg.epsilon && iter > 0) {
      converged = true;
      break;
    }
    prevCost = totalCost;
  }

  const optimizedCost = fractions.reduce((sum, f, i) => {
    return sum + legCost(positions[i], f * totalBudget, liq[i], cfg);
  }, 0);

  const naiveFractions = positions.map((p) => p.size / totalBudget);
  const naiveCost = naiveFractions.reduce((sum, f, i) => {
    return sum + legCost(positions[i], f * totalBudget, liq[i], cfg);
  }, 0);

  const allocations: LegAllocation[] = positions.map((pos, i) => ({
    marketId: pos.marketId,
    side: pos.side,
    fraction: fractions[i],
    estimatedCost: legCost(pos, fractions[i] * totalBudget, liq[i], cfg),
  }));

  const costReductionFraction =
    naiveCost > 0 ? (naiveCost - optimizedCost) / naiveCost : 0;

  const result: FrankWolfeResult = {
    allocations,
    totalCost: optimizedCost,
    naiveCost,
    costReductionFraction,
    iterationsUsed: iter,
    converged,
    optimizationTimeMs: Date.now() - startTime,
  };

  logger.info(
    `[FrankWolfe] Basket ${basket.id} | iter=${iter} | converged=${converged} | ` +
    `cost=${optimizedCost.toFixed(4)} | reduction=${(costReductionFraction * 100).toFixed(2)}% | ` +
    `time=${result.optimizationTimeMs}ms`
  );

  return result;
}

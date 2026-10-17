/**
 * Execution Path Planner — Optimal Order Sequencing for Multi-Leg Baskets
 * Orders legs for execution to minimize market impact and partial-fill risk.
 *
 * Ordering criteria (priority):
 * 1. Liquidity: most liquid legs first (largest liquidity pool → least slippage)
 * 2. Market Impact: smallest size-to-liquidity ratio first (lowest impact)
 * 3. Urgency: legs with higher expected profit executed earlier
 *
 * Used by: strategy-engine, trade-executor
 */

import logger from '../../shared/utils/logger';
import type { MultiLegBasket } from '../../shared/types/ilp-types';
import {
  type FrankWolfeResult,
  optimizeBasketExecution,
} from './multi-leg-frank-wolfe-optimizer';
import {
  type LegMetadata,
  type ExecutionStep,
  type ExecutionPlan,
} from './execution-path-planner-types';
import {
  computeLegScore,
  estimateSlippage,
  buildReason,
  summarizeExecutionPlan,
} from './execution-path-scorer';

export * from './execution-path-planner-types';
export { summarizeExecutionPlan } from './execution-path-scorer';

/**
 * Plan the optimal execution sequence for a multi-leg basket.
 * Optionally runs Frank-Wolfe optimization to reallocate sizes.
 *
 * @param basket - Validated multi-leg basket from Phase 03
 * @param metadataMap - Per-market metadata (liquidity, urgency)
 * @param useOptimizer - Whether to apply FW optimization (default true)
 */
export function planExecutionPath(
  basket: MultiLegBasket,
  metadataMap: Map<string, LegMetadata>,
  useOptimizer = true
): ExecutionPlan {
  const positions = basket.positions;

  if (positions.length === 0) {
    return {
      basketId: basket.id,
      steps: [],
      totalEstimatedCost: 0,
      createdAt: Date.now(),
    };
  }

  // Build liquidity array for optimizer (same order as positions)
  const liquidities = positions.map((p) => {
    const meta = metadataMap.get(p.marketId);
    return meta?.liquidity ?? 1000;
  });

  // Run Frank-Wolfe optimizer to get optimal size allocations
  let optimizerResult: FrankWolfeResult | undefined;
  const sizeMap: Map<string, number> = new Map();

  if (useOptimizer) {
    optimizerResult = optimizeBasketExecution(basket, liquidities);

    // Map optimized fractions back to USDC sizes
    for (const alloc of optimizerResult.allocations) {
      const key = `${alloc.marketId}:${alloc.side}`;
      sizeMap.set(key, alloc.fraction * basket.totalCost);
    }
  } else {
    // Use natural sizes from ILP
    for (const pos of positions) {
      sizeMap.set(`${pos.marketId}:${pos.side}`, pos.size);
    }
  }

  // Score and sort legs
  const scored = positions.map((pos) => {
    const meta = metadataMap.get(pos.marketId) ?? {
      marketId: pos.marketId,
      side: pos.side,
      liquidity: 1000,
      urgency: 0.5,
    };
    return { pos, meta, score: computeLegScore(pos, meta) };
  });

  scored.sort((a, b) => a.score - b.score);

  // Build execution steps
  let totalCost = 0;
  const steps: ExecutionStep[] = scored.map(({ pos, meta }, idx) => {
    const key = `${pos.marketId}:${pos.side}`;
    const size = sizeMap.get(key) ?? pos.size;
    const slippage = estimateSlippage(size, meta.liquidity);
    totalCost += slippage;

    const reason = buildReason(pos, meta, idx, scored.length);

    return {
      step: idx + 1,
      marketId: pos.marketId,
      side: pos.side,
      sizeUsdc: Math.round(size * 100) / 100,
      estimatedSlippage: Math.round(slippage * 10000) / 10000,
      reason,
    };
  });

  logger.info(
    `[PathPlanner] Basket ${basket.id} | ${steps.length} steps | ` +
    `totalCost=${totalCost.toFixed(4)} USDC | optimizer=${useOptimizer}`
  );

  return {
    basketId: basket.id,
    steps,
    totalEstimatedCost: Math.round(totalCost * 10000) / 10000,
    optimization: optimizerResult,
    createdAt: Date.now(),
  };
}

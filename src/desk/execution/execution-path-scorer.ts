/**
 * Execution Path Scoring and Slip Estimation
 *
 * @module desk/execution/execution-path-scorer
 */

import type { ILPPosition } from '../../shared/types/ilp-types';
import type { LegMetadata, ExecutionPlan } from './execution-path-planner-types';

/**
 * Composite priority score — lower = execute earlier.
 * Penalizes high market impact, rewards high liquidity/urgency/profit.
 */
export function computeLegScore(position: ILPPosition, meta: LegMetadata): number {
  const liq = Math.max(meta.liquidity, 1);
  return (
    position.size / liq -
    Math.log(liq + 1) * 0.01 -
    meta.urgency * 0.5 -
    position.expectedProfit * 0.1
  );
}

/** Quadratic slippage: size^2 / liquidity * rate */
export function estimateSlippage(
  size: number,
  liquidity: number,
  slippageRate = 0.001
): number {
  return ((size ** 2) / Math.max(liquidity, 1)) * slippageRate;
}

/**
 * Build a human-readable reason explaining why a leg is at this position.
 */
export function buildReason(
  pos: ILPPosition,
  meta: LegMetadata,
  idx: number,
  total: number
): string {
  const parts: string[] = [];
  if (idx < total * 0.33) parts.push('high liquidity');
  if (meta.urgency > 0.7) parts.push('urgent');
  if (pos.expectedProfit > 0) parts.push(`edge=${pos.expectedProfit.toFixed(4)}`);
  return parts.length > 0 ? parts.join(', ') : 'standard priority';
}

/** Format execution plan as human-readable summary string. */
export function summarizeExecutionPlan(plan: ExecutionPlan): string {
  const opt = plan.optimization;
  const header = [
    `Basket: ${plan.basketId} | Steps: ${plan.steps.length} | Cost: ${plan.totalEstimatedCost} USDC`,
    ...(opt
      ? [
          `FW: ${(opt.costReductionFraction * 100).toFixed(2)}% reduction, ${opt.iterationsUsed} iters`,
        ]
      : []),
  ];
  const steps = plan.steps.map(
    (s) =>
      `  [${s.step}] ${s.marketId} ${s.side} $${s.sizeUsdc} slip=${s.estimatedSlippage} — ${s.reason}`
  );
  return [...header, ...steps].join('\n');
}

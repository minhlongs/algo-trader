/**
 * Frank-Wolfe Multi-Leg Execution Optimizer — Cost Model & Primitives
 * Cost model, gradient, and linear minimization oracle.
 */

import { ILPPosition } from '../../shared/types/ilp-types';

export interface LegAllocation {
  marketId: string;
  side: 'YES' | 'NO';
  /** Fraction of total budget allocated to this leg (0–1) */
  fraction: number;
  /** Estimated execution cost for this leg in USDC */
  estimatedCost: number;
}

export interface FrankWolfeConfig {
  maxIterations: number;
  epsilon: number;
  stepSizeBase: number;
  stepSizeDenom: number;
  slippageRate: number;
  gasPerLeg: number;
  timingRiskWeight: number;
}

export const DEFAULT_FW_CONFIG: FrankWolfeConfig = {
  maxIterations: 50,
  epsilon: 1e-6,
  stepSizeBase: 2,
  stepSizeDenom: 2,
  slippageRate: 0.001,
  gasPerLeg: 0.05,
  timingRiskWeight: 0.1,
};

export interface FrankWolfeResult {
  allocations: LegAllocation[];
  totalCost: number;
  naiveCost: number;
  costReductionFraction: number;
  iterationsUsed: number;
  converged: boolean;
  optimizationTimeMs: number;
}

/** cost = slippage + gas + timing. Formula: rate*size^2/liq + gas + weight*size */
export function legCost(
  _pos: ILPPosition,
  size: number,
  liq: number,
  cfg: FrankWolfeConfig
): number {
  if (size <= 0) return 0;
  return cfg.slippageRate * (size ** 2) / Math.max(liq, 1) + cfg.gasPerLeg + cfg.timingRiskWeight * size;
}

/**
 * Gradient of total cost w.r.t. each fraction.
 * d(cost_i)/df_i = 2*rate*f*budget^2/liq + timing*budget
 */
export function computeGradient(
  fractions: number[],
  _positions: ILPPosition[],
  liquidities: number[],
  totalBudget: number,
  cfg: FrankWolfeConfig
): number[] {
  return fractions.map((f, i) => {
    const liq = Math.max(liquidities[i], 1);
    return 2 * cfg.slippageRate * f * totalBudget * totalBudget / liq + cfg.timingRiskWeight * totalBudget;
  });
}

/**
 * Linear minimization oracle over probability simplex.
 * argmin <∇f, s> s.t. sum(s)=1, s>=0 → put all weight on min-gradient index.
 */
export function linearMinimizationOracle(gradient: number[]): number[] {
  const result = new Array(gradient.length).fill(0);
  const minIdx = gradient.indexOf(Math.min(...gradient));
  result[minIdx] = 1;
  return result;
}

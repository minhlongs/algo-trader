/**
 * Alfonsi, Fruth & Schied (2010) Non-Linear Limit Order Books Mathematics.
 * antiderivative of shape function S(x) = c * x^gamma: F(x) = c / (gamma + 1) * x^(gamma + 1)
 */
import { AlfonsiBookConfig, AlfonsiExecutionStep, AlfonsiExecutionAssessment } from './alfonsi-types';

export function computePriceImpactFromDepth(depth: number, config: AlfonsiBookConfig): number {
  if (depth <= 0) return 0;
  // If S(x) = c x^gamma, depth D = F(p) = c/(gamma+1) p^(gamma+1) => p = ((gamma+1)/c * D)^(1/(gamma+1))
  const denom = config.shapeScalingC;
  const gPlus1 = config.shapeExponentGamma + 1;
  return Math.pow((gPlus1 * depth) / denom, 1 / gPlus1);
}

export function simulateAlfonsiStep(
  priorDepth: number,
  step: AlfonsiExecutionStep,
  config: AlfonsiBookConfig
): AlfonsiExecutionAssessment {
  // 1. Resilience decay from prior step
  const recoveredDepth = priorDepth * Math.exp(-config.resilienceRateKappa * step.elapsedTimeDeltaT);

  // 2. Immediate trade size consumption adds to depth
  const postTradeDepth = recoveredDepth + step.tradeSizeDeltaX;

  // 3. Price impact slippage
  const slippage = computePriceImpactFromDepth(postTradeDepth, config);

  // 4. Execution cost: approx tradeSize * average impact
  const executionCost = step.tradeSizeDeltaX * slippage;

  return {
    currentBookDepthD: postTradeDepth,
    instantaneousSlippage: slippage,
    resilientDepthRecovery: recoveredDepth,
    cumulativeCost: executionCost,
  };
}

import { LehalleMounjid2017Config, LehalleMounjid2017Result } from './types';

/**
 * Wave 257: Lehalle & Mounjid (2017) Optimal Execution with Limit Orders.
 * Strictly < 80 LOC, zero :any.
 */
export function computeLehalleMounjidOptimalOrder(
  config: LehalleMounjid2017Config
): LehalleMounjid2017Result {
  const A = Math.max(1e-4, config.baseFillIntensityA);
  const k = Math.max(1e-4, config.queueDecayK);
  const theta = Math.max(0, config.adverseJumpHazardTheta);
  const deltaP = Math.max(0, config.jumpSeverityDeltaP);
  const gamma = Math.max(0, config.riskAversionGamma);
  const q = config.inventoryQ;
  const maxDist = Math.max(0.1, config.maxQueueDistance ?? 10.0);

  // Adverse selection cost per execution
  const adverseSelectionCost = theta * deltaP;

  // Inventory urgency discount for liquidation
  const inventoryUrgency = (gamma * q) / k;

  // Unconstrained optimal distance delta* = 1/k + adverseCost - urgency
  const rawOptimalDelta = (1.0 / k) + adverseSelectionCost - inventoryUrgency;
  const optimalQueueDistance = Math.min(maxDist, Math.max(0.01, rawOptimalDelta));

  // Resulting fill intensity Lambda(delta*) = A * exp(-k * delta*)
  const optimalFillIntensity = A * Math.exp(-k * optimalQueueDistance);

  // Effective capture spread after adverse jump deduction
  const effectiveCaptureSpread = optimalQueueDistance - adverseSelectionCost;

  // Probability of execution happening under adverse jump regime
  const totalRate = optimalFillIntensity + theta;
  const adverseExecutionProbability = totalRate > 0 ? theta / totalRate : 0;

  // Net expected utility rate: Lambda(delta*) * (delta* - adverseCost - urgency)
  const netExpectedUtility = optimalFillIntensity * (effectiveCaptureSpread - inventoryUrgency);

  return {
    optimalQueueDistance,
    optimalFillIntensity,
    adverseSelectionCost,
    effectiveCaptureSpread,
    adverseExecutionProbability,
    netExpectedUtility,
  };
}

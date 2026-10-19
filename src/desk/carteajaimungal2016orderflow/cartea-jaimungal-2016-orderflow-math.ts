/**
 * Wave 281 — Cartea & Jaimungal (2016): Incorporating Order-Flow into Optimal Execution
 * Closed-form HJB execution speed incorporating Ornstein-Uhlenbeck net market order flow.
 */
import type {
  Cartea2016OrderFlowConfig,
  Cartea2016OrderFlowResult,
} from './types';

export function computeCartea2016OrderFlowExecution(
  cfg: Cartea2016OrderFlowConfig,
): Cartea2016OrderFlowResult {
  const {
    currentInventory: q,
    remainingTimeSec: tau,
    netOrderFlowMu: mu,
    orderFlowReversionKappa: kappa,
    permanentImpactB: b,
    temporaryImpactK: k,
    runningInventoryPenaltyPhi: phi,
  } = cfg;

  if (q < 0 || tau <= 0 || kappa <= 0 || b <= 0 || k <= 0 || phi <= 0) {
    throw new Error('Invalid Cartea2016OrderFlowConfig: parameters outside positive domain');
  }

  const gamma = Math.sqrt(phi / k);
  const cothTerm = Math.cosh(gamma * tau) / Math.max(1e-8, Math.sinh(gamma * tau));
  const baselineRate = gamma * cothTerm * q;

  // Forward integral of decaying OU order-flow drift over remaining horizon tau
  const denom = gamma + kappa;
  const decayFactor = (1 - Math.exp(-denom * tau)) / denom;
  const forwardIntegral = b * mu * decayFactor;
  const flowAdjustment = -forwardIntegral / (2 * k);
  const optimalRate = Math.max(0, baselineRate + flowAdjustment);

  return {
    baselineAlmgrenRate: baselineRate,
    forwardOrderFlowIntegral: forwardIntegral,
    orderFlowAdjustmentRate: flowAdjustment,
    optimalExecutionRate: optimalRate,
  };
}

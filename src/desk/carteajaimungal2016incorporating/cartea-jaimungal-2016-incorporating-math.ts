/**
 * Wave 299 — Cartea & Jaimungal (2016): Incorporating Order-Flow into Optimal Execution
 * Combines Almgren-Chriss liquidation schedule with mean-reverting order-flow co-impact.
 */
import type {
  CarteaJaimungal2016IncorporatingConfig,
  CarteaJaimungal2016IncorporatingResult,
} from './types';

export function computeCarteaJaimungal2016Incorporating(
  cfg: CarteaJaimungal2016IncorporatingConfig,
): CarteaJaimungal2016IncorporatingResult {
  const {
    currentInventoryQ: q,
    remainingHorizonT: T,
    temporaryImpactEta: eta,
    runningInventoryPenaltyPhi: phi,
    netOrderFlowRateMu: mu,
    orderFlowMeanReversionKappa: kappaFlow,
    permanentCoImpactBeta: beta,
  } = cfg;

  if (q <= 0 || T <= 0 || eta <= 0 || phi <= 0 || kappaFlow <= 0 || beta < 0) {
    throw new Error('Invalid CarteaJaimungal2016IncorporatingConfig');
  }

  const gamma = Math.sqrt(phi / eta);
  const cothVal = Math.cosh(gamma * T) / Math.sinh(gamma * T);
  const baseAcRate = gamma * cothVal * q;
  const flowWeight =
    (beta * (1 - Math.exp(-(gamma + kappaFlow) * T))) / (2 * eta * (gamma + kappaFlow));
  const flowAdj = -flowWeight * mu;
  const optimalRate = baseAcRate + flowAdj;

  return {
    urgencyRateGamma: gamma,
    baselineAcExecutionRate: baseAcRate,
    orderFlowSignalAdjustment: flowAdj,
    optimalExecutionRate: optimalRate,
    frontRunningAcceleratesSell: mu < 0 && flowAdj > 0,
  };
}

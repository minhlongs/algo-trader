/**
 * Wave 292 — Guéant (2017): Optimal Market Making with Inventory and Terminal Penalty
 * Computes asymptotic closed-form bid/ask offsets under exponential fill intensity.
 */
import type {
  Gueant2017OptimalMmConfig,
  Gueant2017OptimalMmResult,
} from './types';

export function computeGueant2017OptimalMm(
  cfg: Gueant2017OptimalMmConfig,
): Gueant2017OptimalMmResult {
  const {
    currentInventoryQ: q,
    riskAversionGamma: gamma,
    volatilitySigma: sigma,
    orderFlowIntensityKappa: k,
    baseArrivalRateA: A,
  } = cfg;

  if (gamma <= 0 || sigma <= 0 || k <= 0 || A <= 0) {
    throw new Error('Invalid Gueant2017OptimalMmConfig: parameters must be positive');
  }

  const baseHalfSpread = (1 / gamma) * Math.log(1 + gamma / k);
  const skewCoeff = Math.sqrt(
    ((gamma * sigma * sigma) / (2 * A * k)) * Math.pow(1 + gamma / k, 1 + k / gamma),
  );

  const deltaBid = baseHalfSpread + (q + 0.5) * skewCoeff;
  const deltaAsk = baseHalfSpread - (q - 0.5) * skewCoeff;
  const lambdaBid = A * Math.exp(-k * deltaBid);
  const lambdaAsk = A * Math.exp(-k * deltaAsk);
  const captureRate = lambdaBid * deltaBid + lambdaAsk * deltaAsk;

  return {
    baseHalfSpread,
    reservationSkewPerUnit: skewCoeff,
    optimalBidQuoteOffset: deltaBid,
    optimalAskQuoteOffset: deltaAsk,
    expectedSpreadCaptureRate: captureRate,
  };
}

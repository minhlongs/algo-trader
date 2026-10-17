/**
 * Wave 298 — Guéant, Lehalle & Fernandez-Tapia (2012): Optimal Portfolio Liquidation with Limit Orders
 * Computes optimal limit order quote offset and fill intensity under CARA utility.
 */
import type {
  GueantLehalle2012LimitLiqConfig,
  GueantLehalle2012LimitLiqResult,
} from './types';

export function computeGueantLehalle2012LimitLiq(
  cfg: GueantLehalle2012LimitLiqConfig,
): GueantLehalle2012LimitLiqResult {
  const {
    remainingInventoryQ: q,
    remainingHorizonT: T,
    riskAversionGamma: gamma,
    volatilitySigma: sigma,
    orderFillDecayKappa: k,
    baseArrivalIntensityA: A,
    terminalSweepPenaltyB: b,
  } = cfg;

  if (q <= 0 || T <= 0 || gamma <= 0 || sigma <= 0 || k <= 0 || A <= 0 || b < 0) {
    throw new Error('Invalid GueantLehalle2012LimitLiqConfig');
  }

  const baseOffset = (1 / k) * Math.log(1 + k / gamma);
  const alpha = 0.5 * k * gamma * sigma * sigma;
  const urgencyDiscount =
    ((alpha * q) / (A * (1 + k / gamma))) * (1 / (1 + A * k * T)) + b / (1 + k * T);
  const optimalOffset = baseOffset - urgencyDiscount;
  const fillIntensity = A * Math.exp(-k * optimalOffset);

  return {
    asymptoticLimitOffset: baseOffset,
    urgencyDiscountAdjustment: urgencyDiscount,
    optimalAskPostingOffset: optimalOffset,
    instantaneousFillIntensity: fillIntensity,
    expectedStepLiquidationRate: fillIntensity,
  };
}

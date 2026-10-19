/**
 * Wave 266: Cartea, Jaimungal & Tan (2016) Latency & Execution Delays.
 * Strictly < 85 LOC, zero :any.
 */

import { Cartea2016LatencyConfig, LatencySpreadQuote } from './types';

export function computeCartea2016LatencyQuote(
  cfg: Cartea2016LatencyConfig,
  currentInventory: number,
): LatencySpreadQuote {
  const { latencyDelaySec: delta, sensitivityKappa: kappa, adverseJumpIntensityEta: eta, adverseJumpMeanSizeJ: J, riskAversionGamma: gamma, assetVolatilitySigma: sigma } = cfg;

  if (delta < 0 || kappa <= 0 || eta < 0 || J < 0) {
    throw new Error('Invalid Cartea2016LatencyConfig: invalid parameters');
  }

  // Classical Avellaneda-Stoikov / Cartea half-spread baseline: 1/kappa + 0.5 * gamma * sigma^2 * (T-t)
  const baselineSpread = 1 / kappa;
  const inventorySkew = (2 * currentInventory + 1) * (gamma * sigma * sigma * 0.5);

  // Probability of adverse information jump occurring during cancellation delay delta:
  // P(Jump in [t, t+delta]) approx 1 - exp(-eta * delta)
  const jumpProb = 1 - Math.exp(-eta * delta);
  // Adverse selection penalty added to quote to compensate for stale resting order:
  const adversePenalty = jumpProb * J + 0.5 * eta * delta * J;

  // Asymmetric inventory adjustment
  const halfSpreadBid = Math.max(0.0001, baselineSpread - inventorySkew + adversePenalty);
  const halfSpreadAsk = Math.max(0.0001, baselineSpread + inventorySkew + adversePenalty);
  const totalSpread = halfSpreadBid + halfSpreadAsk;
  const zeroLatencySpread = 2 * baselineSpread;
  const widerRatio = totalSpread / Math.max(1e-4, zeroLatencySpread);

  return {
    inventory: currentInventory,
    optimalHalfSpreadBid: halfSpreadBid,
    optimalHalfSpreadAsk: halfSpreadAsk,
    adverseSelectionPenalty: adversePenalty,
    totalSpread,
    latencyWiderRatio: widerRatio,
  };
}

export function computeLatencySpreadProfile(
  cfg: Cartea2016LatencyConfig,
  inventoryLevels: readonly number[],
): readonly LatencySpreadQuote[] {
  return inventoryLevels.map(q => computeCartea2016LatencyQuote(cfg, q));
}

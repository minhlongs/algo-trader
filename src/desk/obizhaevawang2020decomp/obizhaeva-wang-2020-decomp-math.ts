/**
 * Wave 267: Obizhaeva, Wang & Wang (2020) High-Frequency Dynamic Inventory and Information Decomposition.
 * Strictly < 85 LOC, zero :any.
 */

import { Obizhaeva2020DecompConfig, Obizhaeva2020DecompResult, TradeImpactDecompStep } from './types';

export function computeObizhaeva2020Decomposition(
  cfg: Obizhaeva2020DecompConfig,
  tradeSequence: readonly { size: number; dt: number }[],
): Obizhaeva2020DecompResult {
  const { resilienceRateRho: rho, informationWeightAlpha: alpha, impactIntensityLambda: lambda } = cfg;

  if (rho <= 0 || lambda <= 0 || alpha < 0 || alpha > 1) {
    throw new Error('Invalid Obizhaeva2020DecompConfig: parameters out of theoretical domain');
  }

  const steps: TradeImpactDecompStep[] = [];
  let cumPermanent = 0;
  let transientState = 0;

  for (let k = 0; k < tradeSequence.length; k++) {
    const { size, dt } = tradeSequence[k];
    // Exponential decay of prior transient price displacement between orders
    const decay = Math.exp(-rho * Math.max(0, dt));
    transientState = transientState * decay;

    // Price impact decomposition:
    // Permanent informational component: Delta P_k = alpha * lambda * size
    const dPerm = alpha * lambda * size;
    // Transient order book resiliency displacement: Delta D_k = (1 - alpha) * lambda * size
    const dTrans = (1 - alpha) * lambda * size;

    cumPermanent += dPerm;
    transientState += dTrans;

    const totalDelta = dPerm + dTrans;
    const expectedRecovery = transientState * (1 - Math.exp(-rho * 1.0));

    steps.push({
      tradeIndex: k,
      tradeSize: size,
      transientComponent: transientState,
      permanentComponent: cumPermanent,
      totalMarketPriceChange: totalDelta,
      bookRecoveryExpected: expectedRecovery,
    });
  }

  return {
    steps,
    cumulativePermanentImpact: cumPermanent,
    residualTransientImpact: transientState,
    informationalFraction: alpha,
  };
}

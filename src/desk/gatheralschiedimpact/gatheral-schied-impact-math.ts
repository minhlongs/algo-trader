/**
 * Wave 246: Gatheral & Schied (2013) Market Impact Decay Integral Equations Math
 * Strictly < 85 LOC, zero mocks, kernel convolution integration.
 */

import { GatheralSchiedImpactConfig, ImpactIntegralState, TradeSlice } from './gatheral-schied-impact-types';

export function evaluateDecayKernel(
  dt: number,
  config: GatheralSchiedImpactConfig
): number {
  if (dt <= 0) return 1.0;
  if (config.decayType === 'EXPONENTIAL') {
    const rho = config.exponentialDecayRho ?? 0.5;
    return Math.exp(-rho * dt);
  }
  // Power law G(dt) = (1 + dt)^(-alpha)
  return Math.pow(1.0 + dt, -config.decayKernelAlpha);
}

export function computeDecayImpactIntegral(
  history: TradeSlice[],
  currentTime: number,
  config: GatheralSchiedImpactConfig
): ImpactIntegralState {
  let cumulativeImpact = 0;
  let latestInstantaneousShift = 0;

  for (const slice of history) {
    if (slice.timestamp <= currentTime) {
      const dt = currentTime - slice.timestamp;
      const kernelWeight = evaluateDecayKernel(dt, config);
      const impactContribution = config.instantaneousImpactGamma * slice.tradeSize * kernelWeight;
      cumulativeImpact += impactContribution;

      if (dt === 0) {
        latestInstantaneousShift += config.instantaneousImpactGamma * slice.tradeSize;
      }
    }
  }

  const resilienceDecayRate = evaluateDecayKernel(1.0, config);

  return {
    cumulativePriceImpact: cumulativeImpact,
    instantaneousPriceShift: latestInstantaneousShift,
    resilienceDecayRate,
  };
}

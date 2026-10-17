/**
 * Wave 220: Gatheral & Oomen (2010) Zero-Intelligence Order Book Math.
 *
 * Implements Poisson queue equilibrium and volatility signature analytics.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import type {
  GatheralOomenConfig,
  ZeroIntelligenceMetrics,
  VolatilitySignaturePoint,
} from './gatheral-oomen-types';

export class GatheralOomenMath {
  public static calculateEquilibriumMetrics(config: GatheralOomenConfig): ZeroIntelligenceMetrics {
    const lambda = Math.max(0.1, config.limitOrderArrivalRate);
    const mu = Math.max(0.01, config.marketOrderArrivalRate);
    const theta = Math.max(0.001, config.cancellationRate);

    const netArrival = Math.max(0.1, lambda - mu);
    const equilibriumDepthShares = Number((netArrival / theta).toFixed(2));
    const queueTurnoverRate = Number(((mu + theta * equilibriumDepthShares) / equilibriumDepthShares).toFixed(4));

    // Spread estimate inversely proportional to queue depth relative to intensity
    const expectedSpreadTicks = Number(Math.max(1.0, 1.0 + (mu / lambda)).toFixed(2));
    const impliedMicrostructureNoise = Number(((config.tickSize * config.tickSize) / (4.0 * Math.max(1e-6, config.baseVolatilitySigma0))).toFixed(6));

    return {
      equilibriumDepthShares,
      queueTurnoverRate,
      expectedSpreadTicks,
      impliedMicrostructureNoise,
    };
  }

  public static generateVolatilitySignature(
    config: GatheralOomenConfig,
    timeLagsSec: number[]
  ): VolatilitySignaturePoint[] {
    const sigma0Sq = Math.max(1e-8, config.baseVolatilitySigma0 * config.baseVolatilitySigma0);
    const kappa = Math.max(0.01, config.meanReversionKappa ?? 0.5);

    return timeLagsSec.map((tau) => {
      const t = Math.max(0.01, tau);
      // Volatility signature formula: sigma^2(tau) = sigma0^2 * (1 + (1 - exp(-kappa * tau)) / (kappa * tau))
      const expTerm = (1.0 - Math.exp(-kappa * t)) / (kappa * t);
      const varianceRatio = 1.0 + expTerm;
      const realizedVarianceEstimate = sigma0Sq * varianceRatio;

      return {
        lagTimeSec: Number(t.toFixed(2)),
        realizedVarianceEstimate: Number(realizedVarianceEstimate.toFixed(8)),
        varianceRatio: Number(varianceRatio.toFixed(4)),
      };
    });
  }
}

import type {
  Gatheral2014VolatilityRoughInput,
  Gatheral2014VolatilityRoughOutput,
} from './types';

export class Gatheral2014VolatilityRough {
  /**
   * Gatheral, Jaisson & Rosenbaum (2014/2018) Volatility is Rough:
   * Estimates Hurst exponent H from multi-scale log-volatility variogram
   * E[|log sigma_{t+Delta} - log sigma_t|^q] = K_q * Delta^{q H}.
   */
  static evaluate(
    input: Gatheral2014VolatilityRoughInput
  ): Gatheral2014VolatilityRoughOutput {
    const d1 = Math.max(1e-6, input.lagFineDaysDelta1);
    const d2 = Math.max(d1 * 1.001, input.lagCoarseDaysDelta2);
    const m1 = Math.max(1e-12, input.variogramMomentLag1);
    const m2 = Math.max(1e-12, input.variogramMomentLag2);
    const q = Math.max(0.1, input.momentOrderQ);

    const scalingRatio = m2 / m1;
    const rawH = Math.log(scalingRatio) / (q * Math.log(d2 / d1));
    const estimatedHurstExponentH = Math.max(0.01, Math.min(0.99, rawH));
    const roughnessIndexAlpha = estimatedHurstExponentH - 0.5;
    const atmSkewPowerLawExponent = roughnessIndexAlpha;

    const regime =
      estimatedHurstExponentH < 0.45
        ? 'ROUGH_FRACTIONAL'
        : estimatedHurstExponentH > 0.55
          ? 'LONG_MEMORY_PERSISTENT'
          : 'DIFFUSIVE_BROWNIAN';

    return {
      estimatedHurstExponentH: Number(estimatedHurstExponentH.toFixed(6)),
      roughnessIndexAlpha: Number(roughnessIndexAlpha.toFixed(6)),
      scalingRatio: Number(scalingRatio.toFixed(6)),
      atmSkewPowerLawExponent: Number(atmSkewPowerLawExponent.toFixed(6)),
      regime,
    };
  }
}

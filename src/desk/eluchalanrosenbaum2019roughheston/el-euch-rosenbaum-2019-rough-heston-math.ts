import { ElEuchRosenbaum2019Input, ElEuchRosenbaum2019Output } from './types';

/**
 * Wave 335: El Euch & Rosenbaum (2019) Characteristic Function of Rough Heston Models.
 * Evaluates fractional kernel order alpha = H + 1/2, short-maturity ATM skew scaling T^(H - 1/2),
 * and Mittag-Leffler fractional variance term structure approximation.
 */
export class ElEuchRosenbaum2019RoughHeston {
  public evaluate(input: ElEuchRosenbaum2019Input): ElEuchRosenbaum2019Output {
    const H = Math.min(0.499, Math.max(0.01, input.hurstExponent));
    const fractionalAlpha = Number((H + 0.5).toFixed(6));
    const T = Math.max(1e-4, input.timeToMaturityYears);
    const v0 = Math.max(1e-6, input.spotVarianceV0);

    const scalingFactor = Math.pow(T, H - 0.5);
    const shortTermAtmSkewSlope = Number(
      ((input.spotVolCorrelationRho * input.volOfVolNu) / (2 * Math.sqrt(v0)) * scalingFactor).toFixed(6),
    );

    const mittagDecay = 1 / (1 + input.meanReversionLambda * Math.pow(T, fractionalAlpha));
    const fractionalVarianceTermStructure = Number((v0 * mittagDecay).toFixed(6));

    const roughVolConvexityAdjustment = Number(
      ((input.volOfVolNu * input.volOfVolNu * Math.pow(T, 2 * H)) / (1 + 2 * H)).toFixed(6),
    );

    const surfaceRegime =
      H <= 0.15
        ? 'ROUGH_STEEP_SKEW'
        : H <= 0.35
          ? 'MODERATE_FRACTIONAL_SKEW'
          : 'CLASSICAL_MARKOVIAN';

    return {
      fractionalAlpha,
      shortTermAtmSkewSlope,
      fractionalVarianceTermStructure,
      roughVolConvexityAdjustment,
      surfaceRegime,
    };
  }
}

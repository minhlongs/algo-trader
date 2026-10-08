import { RoughVarianceCurvePoint } from './roughvol-types';

export class RoughBergomiCurveGenerator {
  public generateVarianceCurve(
    spotVarianceV0: number,
    hurstH: number,
    tenorsYears: number[],
    meanReversionRate = 0.50
  ): RoughVarianceCurvePoint[] {
    const safeH = Math.max(0.02, Math.min(0.49, hurstH));
    const powerExp = safeH - 0.50; // negative for rough regime, creates steep skew at short tenors

    return tenorsYears.map(tau => {
      const safeTau = Math.max(0.01, tau);
      const kernelWeight = Math.pow(safeTau, powerExp);
      const forwardVariance = spotVarianceV0 * (1.0 + 0.15 * Math.exp(-meanReversionRate * safeTau));
      const roughSkewSlope = -0.5 * kernelWeight; // Power-law blow-up as tau -> 0

      return {
        timeToMaturityYears: Number(safeTau.toFixed(3)),
        forwardVariance: Number(forwardVariance.toFixed(6)),
        roughSkewSlope: Number(roughSkewSlope.toFixed(4)),
      };
    });
  }
}

import { MargrabeGreeks } from './margrabe-types';

export class MargrabeMath {
  public static stdNormPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static stdNormCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * absX);
    const erf =
      1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
  }

  // Composite volatility sigma_hat = sqrt(sigma1^2 + sigma2^2 - 2*rho*sigma1*sigma2)
  public static compositeVolatility(s1: number, s2: number, rho: number): number {
    const variance = s1 * s1 + s2 * s2 - 2.0 * rho * s1 * s2;
    return Math.sqrt(Math.max(1e-12, variance));
  }

  public static calculatePriceAndGreeks(
    s1: number,
    s2: number,
    vol1: number,
    vol2: number,
    rho: number,
    t: number,
    q1: number = 0.0,
    q2: number = 0.0
  ): { optionPrice: number; compositeVol: number; d1: number; d2: number; greeks: MargrabeGreeks } {
    const sigma = this.compositeVolatility(vol1, vol2, rho);
    const sqrtT = Math.sqrt(t);
    const sigmaSqrtT = sigma * sqrtT;

    const d1 = (Math.log(s1 / s2) + (q2 - q1 + 0.5 * sigma * sigma) * t) / sigmaSqrtT;
    const d2 = d1 - sigmaSqrtT;

    const df1 = Math.exp(-q1 * t);
    const df2 = Math.exp(-q2 * t);
    const nd1 = this.stdNormCdf(d1);
    const nd2 = this.stdNormCdf(d2);
    const npdf1 = this.stdNormPdf(d1);

    const optionPrice = Math.max(0.0, s1 * df1 * nd1 - s2 * df2 * nd2);

    // Analytical Greeks
    const delta1 = df1 * nd1;
    const delta2 = -df2 * nd2;
    const gamma1 = (df1 * npdf1) / (s1 * sigmaSqrtT);
    const gamma2 = (df2 * npdf1) / (s2 * sigmaSqrtT);
    const crossGamma = -(df1 * npdf1) / (s2 * sigmaSqrtT);

    const dSigmaDVol1 = (vol1 - rho * vol2) / sigma;
    const dSigmaDVol2 = (vol2 - rho * vol1) / sigma;
    const vegaTotal = s1 * df1 * sqrtT * npdf1;
    const vega1 = vegaTotal * dSigmaDVol1;
    const vega2 = vegaTotal * dSigmaDVol2;

    const thetaTerm1 = -(s1 * df1 * npdf1 * sigma) / (2.0 * sqrtT);
    const thetaTerm2 = -q1 * s1 * df1 * nd1;
    const thetaTerm3 = q2 * s2 * df2 * nd2;
    const theta = thetaTerm1 + thetaTerm2 + thetaTerm3;

    return {
      optionPrice,
      compositeVol: sigma,
      d1,
      d2,
      greeks: {
        delta1,
        delta2,
        gamma1,
        gamma2,
        crossGamma,
        vega1,
        vega2,
        theta,
      },
    };
  }
}

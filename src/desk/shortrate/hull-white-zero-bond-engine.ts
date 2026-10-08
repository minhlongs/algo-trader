import { HullWhiteParams, ZeroBondPrice } from './hull-white-types';

export class HullWhiteZeroBondEngine {
  public computeBFactor(a: number, t: number, T: number): number {
    const tau = Math.max(0, T - t);
    if (Math.abs(a) < 1e-6) {
      return tau;
    }
    return (1.0 - Math.exp(-a * tau)) / a;
  }

  public computeAFactor(a: number, sigma: number, t: number, T: number): number {
    const tau = Math.max(0, T - t);
    const B = this.computeBFactor(a, t, T);
    const variance = (sigma * sigma / (2 * a * a)) * (B - tau * Math.exp(-a * tau) - (a / 2) * B * B);
    return Math.exp(-variance);
  }

  public priceZeroCouponBond(params: HullWhiteParams, maturityYearsT: number): ZeroBondPrice {
    const { meanReversionA: a, shortRateVolSigma: sigma, currentShortRateR0: r0 } = params;
    const B = this.computeBFactor(a, 0, maturityYearsT);
    const A = this.computeAFactor(a, sigma, 0, maturityYearsT);

    const P = A * Math.exp(-B * r0);
    const zeroYieldPct = maturityYearsT > 0 ? (-Math.log(P) / maturityYearsT) * 100.0 : r0 * 100.0;

    return {
      maturityYearsT,
      discountFactorP: Number(P.toFixed(6)),
      zeroYieldPct: Number(zeroYieldPct.toFixed(4)),
      bFactor: Number(B.toFixed(6)),
      aFactor: Number(A.toFixed(6)),
    };
  }
}

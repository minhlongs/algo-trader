import { VasicekModelParameters, VasicekYieldCurveTenor, ZeroCouponBondPriceResult } from './vasicek-types';

export class VasicekTermStructureEngine {
  public priceZeroCouponBond(
    params: VasicekModelParameters,
    maturityT: number,
    parValueUsd = 100.0
  ): ZeroCouponBondPriceResult {
    const { currentShortRateR0: r0, speedOfReversionA: a, longTermMeanB: b, volatilitySigma: sigma } = params;

    if (maturityT <= 0) throw new Error('Maturity must be positive');
    if (a <= 0) throw new Error('Speed of mean reversion a must be positive');
    if (sigma <= 0) throw new Error('Volatility sigma must be positive');
    if (parValueUsd <= 0) throw new Error('parValueUsd must be positive');

    // B(0, T) = (1 - exp(-a * T)) / a
    const B = (1.0 - Math.exp(-a * maturityT)) / a;

    // A(0, T) = exp( (b - sigma^2 / (2 * a^2)) * (B - T) - (sigma^2 / (4 * a)) * B^2 )
    const term1 = b - (sigma * sigma) / (2.0 * a * a);
    const term2 = (sigma * sigma) / (4.0 * a);
    const lnA = term1 * (B - maturityT) - term2 * B * B;
    const A = Math.exp(lnA);

    // P(0, T) = A * exp(-B * r0)
    const pUnit = A * Math.exp(-B * r0);
    const bondPrice = pUnit * parValueUsd;

    // Continuously compounded spot yield: R(0, T) = -ln(P(0, T)) / T
    const yieldPct = (-Math.log(pUnit) / maturityT) * 100.0;

    // Instantaneous forward rate: f(0, T) = -d/dT ln P(0, T)
    // f(0, T) = r0 * exp(-a * T) + b * (1 - exp(-a * T)) - (sigma^2 / (2 * a^2)) * (1 - exp(-a * T))^2
    const expNegAT = Math.exp(-a * maturityT);
    const oneMinusExp = 1.0 - expNegAT;
    const forwardRate = r0 * expNegAT + b * oneMinusExp - ((sigma * sigma) / (2.0 * a * a)) * Math.pow(oneMinusExp, 2.0);
    const forwardRatePct = forwardRate * 100.0;

    return {
      maturityYears: maturityT,
      bondPriceUsd: Number(bondPrice.toFixed(4)),
      continuouslyCompoundedYieldPct: Number(yieldPct.toFixed(4)),
      instantaneousForwardRatePct: Number(forwardRatePct.toFixed(4)),
      durationB: Number(B.toFixed(4)),
      convexityFactorA: Number(A.toFixed(6)),
    };
  }

  public generateYieldCurve(
    params: VasicekModelParameters,
    tenors: number[] = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]
  ): VasicekYieldCurveTenor[] {
    return tenors.map((tenor) => {
      const result = this.priceZeroCouponBond(params, tenor);
      return {
        tenorYears: tenor,
        yieldPct: result.continuouslyCompoundedYieldPct,
        priceUsd: result.bondPriceUsd,
      };
    });
  }
}

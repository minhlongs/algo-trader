import {
  VasicekParams,
  VasicekZeroBondResult,
  VasicekTermStructureResult,
} from './vasicekrate-types.js';
import { VasicekMath } from './vasicekrate-math.js';

export class VasicekEngine {
  public static validate(params: VasicekParams): void {
    if (params.meanReversionSpeed <= 0) throw new Error('Mean reversion speed k must be positive');
    if (params.volatility <= 0) throw new Error('Short-rate volatility must be positive');
  }

  /**
   * Prices zero-coupon bond P(0, T) = A(T) * exp(-B(T) * r0)
   */
  public static priceZeroCouponBond(params: VasicekParams, maturity: number): VasicekZeroBondResult {
    this.validate(params);
    if (maturity <= 0) throw new Error('Maturity must be positive');

    const { currentRate: r0, meanReversionSpeed: k, longTermMeanRate: theta, volatility: sigma } = params;

    const B = VasicekMath.calculateB(maturity, k);
    const A = VasicekMath.calculateA(maturity, k, theta, sigma);
    const price = A * Math.exp(-B * r0);
    const yieldRate = -Math.log(price) / maturity;
    const forwardRate = VasicekMath.calculateForwardRate(maturity, r0, k, theta, sigma);
    const yieldVolatility = (sigma * B) / maturity;

    return {
      maturity,
      price,
      yieldRate,
      forwardRate,
      yieldVolatility,
    };
  }

  /**
   * Generates discrete yield term structure curve up to T maturities.
   */
  public static generateYieldCurve(params: VasicekParams, maturities: number[]): VasicekTermStructureResult {
    this.validate(params);
    const curve = maturities.map(m => this.priceZeroCouponBond(params, m));
    const kSq = params.meanReversionSpeed * params.meanReversionSpeed;
    const longTermAsymptoticYield = params.longTermMeanRate - (params.volatility * params.volatility) / (2.0 * kSq);

    return {
      curve,
      longTermAsymptoticYield,
    };
  }
}

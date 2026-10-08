import { HullWhiteParams, YieldCurve, HullWhitePricingResult } from './hull-white-types';

export class HullWhiteEngine {
  /**
   * Calculates the zero-coupon bond price P(t, T) under the analytical Hull-White model (Extended Vasicek).
   * Perfectly fits the initial yield curve passing through YieldCurve provider.
   */
  public static calculateZeroCouponBond(
    params: HullWhiteParams,
    curve: YieldCurve,
    rt: number, // current short rate r(t) at time t
    t: number,  // valuation time
    T: number   // maturity time
  ): HullWhitePricingResult {
    const a = params.a;
    const sigma = params.sigma;

    if (T <= t) {
      return { priceZCB: 1.0, ATmTime: 1.0, BTmTime: 0.0, forwardRate: rt };
    }

    const dt = T - t;

    // B(t, T) calculation
    let B: number;
    if (Math.abs(a) < 1e-7) {
      B = dt; 
    } else {
      B = (1.0 - Math.exp(-a * dt)) / a;
    }

    // A(t, T) calculation
    const P0t = curve.getDiscountFactor(t);
    const P0T = curve.getDiscountFactor(T);
    const f0t = curve.getForwardRate(t);

    let lnA = 0.0;
    if (P0t > 0 && P0T > 0) {
      const vTerm = (sigma * sigma / (4.0 * Math.pow(a, 3))) *
                    Math.pow(Math.exp(-a * T) - Math.exp(-a * t), 2) *
                    (Math.exp(2.0 * a * t) - 1.0);
      
      lnA = Math.log(P0T / P0t) + B * f0t - vTerm;
    }
    const A = Math.exp(lnA);

    // ZCB price: P(t, T) = A(t, T) * exp(-B(t, T) * r(t))
    const price = A * Math.exp(-B * rt);
    
    const impliedForward = -Math.log(price) / dt;

    return {
      priceZCB: price,
      ATmTime: A,
      BTmTime: B,
      forwardRate: impliedForward
    };
  }
}

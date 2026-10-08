export interface HullWhiteParams {
  a: number;         // Mean reversion speed
  sigma: number;     // Volatility of the short rate
}

/**
 * Interface representing the initial term structure.
 * Returns the zero-coupon bond price P(0,T) and instantaneous forward rate f(0,T).
 */
export interface YieldCurve {
  getDiscountFactor(T: number): number; // P(0, T)
  getForwardRate(T: number): number;    // f(0, T)
}

export interface HullWhitePricingResult {
  priceZCB: number;        // P(t, T) given r(t)
  ATmTime: number;         // A(t, T) analytical factor
  BTmTime: number;         // B(t, T) analytical factor
  forwardRate: number;     // Extracted theoretical forward rate
}

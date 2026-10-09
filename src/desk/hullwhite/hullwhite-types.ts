/**
 * Hull-White (1990) One-Factor Short-Rate Term Structure & Bond Option Types
 */

export interface HullWhiteModelParams {
  meanReversion: number; // a > 0
  volatility: number; // sigma > 0
  currentShortRate: number; // r0
}

export interface ZeroCouponBondParams {
  maturity: number; // T in years
  settlement?: number; // t in years, defaults to 0
}

export interface EuropeanBondOptionParams {
  optionMaturity: number; // T_option (expiry of option)
  bondMaturity: number; // T_bond (maturity of underlying zero-coupon bond, T_bond > T_option)
  strikePrice: number; // K
  isCall: boolean;
}

export interface HullWhiteResult {
  bondPrice: number; // P(t, T)
  yieldToMaturity: number; // R(t, T)
  forwardRate: number; // instantaneous or continuous forward
  B: number; // B(t, T)
  A: number; // A(t, T)
}

export interface EuropeanBondOptionResult {
  optionPrice: number;
  bondForwardPrice: number;
  strikePrice: number;
  optionMaturity: number;
  bondMaturity: number;
  optionVolatility: number; // sigma_p
  d1: number;
  d2: number;
  greeks: {
    deltaRate: number;
    gammaRate: number;
    vega: number;
    theta: number;
  };
}

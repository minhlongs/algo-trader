/**
 * Carr-Wu (2004) Finite Moment Log-Stable (FMLS) Process Types
 *
 * References:
 * Carr, P., & Wu, L. (2004). The Finite Moment Log-Stable Process and Option Pricing.
 * Journal of Finance, 58(2), 753-777.
 *
 * @module desk/carrwu/carr-wu-types
 */

export interface CarrWuParams {
  /** Stability index alpha in (1, 2] governing tail thickness. alpha=2 is Gaussian */
  alpha: number;
  /** Scale volatility parameter sigma > 0 */
  sigma: number;
  /** Risk-free interest rate r >= 0 */
  rate: number;
  /** Continuous dividend / convenience yield q >= 0 */
  dividendYield: number;
}

export interface CarrWuOptionInput {
  /** Spot price S0 > 0 */
  spot: number;
  /** Strike price K > 0 */
  strike: number;
  /** Time to maturity in years T > 0 */
  timeToMaturity: number;
  /** Option type: call or put */
  optionType: 'call' | 'put';
  /** Model parameters */
  params: CarrWuParams;
}

export interface CarrWuGreeks {
  /** First derivative w.r.t. spot dV/dS */
  delta: number;
  /** Second derivative w.r.t. spot d^2V/dS^2 */
  gamma: number;
  /** Derivative w.r.t. scale parameter dV/dsigma */
  vega: number;
  /** Time decay -dV/dT */
  theta: number;
  /** Derivative w.r.t. stability index alpha dV/dalpha */
  skewSensitivity: number;
}

export interface CarrWuOptionResult {
  /** Option premium */
  price: number;
  /** Intrinsic value max(S - K, 0) or max(K - S, 0) */
  intrinsicValue: number;
  /** Time value (price - intrinsic) */
  timeValue: number;
  /** Martingale convexity adjustment omega */
  convexityAdjustment: number;
  /** Gil-Pelaez probabilities [Pi1, Pi2] */
  probabilities: {
    pi1: number;
    pi2: number;
  };
  /** Analytical / finite-difference Greeks */
  greeks: CarrWuGreeks;
}

export interface CarrWuSmilePoint {
  strike: number;
  moneyness: number;
  price: number;
  impliedVol: number;
}

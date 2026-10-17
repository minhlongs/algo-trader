/**
 * Kou (2002) Double Exponential Jump-Diffusion Model Types
 *
 * S.G. Kou (2002) "A Jump-Diffusion Model for Option Pricing"
 * Management Science 48(8): 1086-1101.
 *
 * @module desk/kou/kou-types
 */

export interface KouConfig {
  /** Spot price S_0 */
  spot: number;
  /** Strike price K */
  strike: number;
  /** Time to maturity T in years */
  maturity: number;
  /** Risk-free interest rate r (e.g. 0.05 for 5%) */
  riskFreeRate: number;
  /** Continuous dividend yield q (e.g. 0.01 for 1%) */
  dividendYield?: number;
  /** Continuous diffusion volatility sigma */
  volatility: number;
  /** Jump arrival intensity lambda (Poisson rate per year) */
  jumpIntensity: number;
  /** Probability of an upward jump p in [0, 1] */
  pUp: number;
  /** Decay rate of upward jumps eta1 > 1 */
  eta1: number;
  /** Decay rate of downward jumps eta2 > 0 */
  eta2: number;
}

export interface KouOptionResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface KouMoments {
  meanLogReturn: number;
  variance: number;
  skewness: number;
  excessKurtosis: number;
  jumpMean: number;
  jumpVariance: number;
}

/** Legacy parameters and specs for backward compatibility */
export interface KouModelParameters {
  readonly sigma: number;
  readonly lambda: number;
  readonly p: number;
  readonly eta1: number;
  readonly eta2: number;
}

export interface KouJumpMoments {
  readonly meanJumpSize: number;
  readonly varianceJumpSize: number;
  readonly expectedRelativeJump: number;
}

export interface KouOptionSpec {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly dividendYieldPct?: number;
  readonly isCall: boolean;
}

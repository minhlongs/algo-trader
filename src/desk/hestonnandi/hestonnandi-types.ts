/**
 * Type definitions for Heston & Nandi (2000) GARCH Option Pricing Engine.
 * Seminal paper: Review of Financial Studies, Vol. 13, No. 3, pp. 585-625.
 * Strictly < 150 LOC, zero `:any` types.
 */

export interface ComplexNumber {
  readonly real: number;
  readonly imag: number;
}

export interface HestonNandiParameters {
  /** Unconditional base variance component omega */
  readonly omega: number;
  /** Autoregressive volatility persistence beta */
  readonly beta: number;
  /** Kurtosis/innovation coefficient alpha */
  readonly alpha: number;
  /** Leverage asymmetry parameter gamma */
  readonly gamma: number;
  /** Return risk premium parameter lambda */
  readonly lambda: number;
  /** Daily continuously compounded risk-free rate r */
  readonly riskFreeRate: number;
}

export interface HestonNandiOptionInput {
  /** Current underlying spot price S */
  readonly spotPrice: number;
  /** Strike price K */
  readonly strikePrice: number;
  /** Time to expiration in trading days (tau = T - t) */
  readonly daysToExpiration: number;
  /** Initial conditional variance h_{t+1} (or long-run variance) */
  readonly initialVariance?: number;
  /** GARCH model parameters */
  readonly parameters: HestonNandiParameters;
}

export interface HestonNandiOptionResult {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly daysToExpiration: number;
  readonly callPrice: number;
  readonly putPrice: number;
  readonly p1Prob: number;
  readonly p2Prob: number;
  readonly unconditionalVariance: number;
  readonly stationary: boolean;
  readonly deltaCall: number;
  readonly gammaCall: number;
}

export interface SabrParameters {
  readonly alpha: number; // Initial volatility
  readonly beta: number;  // Elasticity parameter (CEV exponent in [0, 1])
  readonly rho: number;   // Correlation between asset and volatility Brownian motions in [-1, 1]
  readonly nu: number;    // Volatility of volatility (vol-of-vol >= 0)
}

export interface SabrEvaluationRequest {
  readonly forwardPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly parameters: SabrParameters;
}

export interface SabrImpliedVolResult {
  readonly forwardPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly impliedVolPct: number;
  readonly isAtm: boolean;
}

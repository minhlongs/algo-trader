export interface G2ppParameters {
  readonly a: number;     // Mean reversion factor 1 (a > 0)
  readonly b: number;     // Mean reversion factor 2 (b > 0, b != a)
  readonly sigma: number; // Volatility factor 1 (sigma > 0)
  readonly eta: number;   // Volatility factor 2 (eta > 0)
  readonly rho: number;   // Correlation factor (-1 <= rho <= 1)
}

export interface G2ppState {
  readonly x: number;     // Factor 1 state at time t
  readonly y: number;     // Factor 2 state at time t
  readonly t: number;     // Observation time
}

export interface G2ppBondPricingResult {
  readonly price: number;
  readonly yieldToMaturityPct: number;
  readonly varianceIntegral: number;
  readonly instantaneousForwardRatePct: number;
  readonly maturityTau: number;
}

export interface SabrParams {
  forward: number;     // Forward price (F)
  strike: number;      // Strike price (K)
  timeToExpiry: number; // Time to expiration (T)

  // Model parameters
  alpha: number;       // Initial volatility (vol of vol roughly)
  beta: number;        // CEV exponent (0 = Normal, 1 = Lognormal)
  rho: number;         // Correlation between asset and volatility Brownian motions
  nu: number;          // Volatility of volatility (vov)
}

export interface SabrResult {
  impliedVolatility: number;
  z: number;
  xz: number;
  isValid: boolean;
}

// Legacy aliases to preserve backward compatibility
export type SabrParameters = Pick<SabrParams, 'alpha' | 'beta' | 'rho' | 'nu'>;

export interface SabrEvaluationRequest {
  forwardPrice: number;
  strikePrice: number;
  timeToExpiryYears: number;
  parameters: SabrParameters;
}

export interface SabrImpliedVolResult {
  forwardPrice: number;
  strikePrice: number;
  timeToExpiryYears: number;
  impliedVolPct: number;
  isAtm: boolean;
}

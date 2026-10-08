export interface DupirePricingSurface {
  /**
   * Returns the European Call option price for a given Strike (K) and Time to Maturity (T)
   */
  priceCall(strike: number, timeToEquity: number): number;
}

export interface DupireLocalVolConfig {
  readonly riskFreeRate: number; // r
  readonly dividendYield: number; // q
  readonly dK?: number; // Finite difference step for strike
  readonly dT?: number; // Finite difference step for time
}

export interface DupireResult {
  readonly localVolatility: number;
  readonly localVariance: number;
  readonly firstDerivativeT: number; // dC/dT
  readonly firstDerivativeK: number; // dC/dK
  readonly secondDerivativeK: number; // d^2C/dK^2
}

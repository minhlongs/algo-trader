export interface BlackCoxParams {
  assetValue: number;       // V0: Current firm asset value
  defaultThreshold: number; // K: Face value of debt / base barrier level
  growthRate: number;       // r: Risk-free rate / asset drift
  volatility: number;       // sigma: Asset return volatility
  barrierDiscountRate: number; // gamma: Rate at which safety covenant grows/shrinks
  timeHorizon: number;      // T: Debt maturity / horizon in years
  recoveryRate: number;     // R: Fractional recovery in default (e.g. 0.4)
}

export interface BlackCoxResult {
  survivalProbability: number;     // Q(T)
  defaultProbability: number;      // 1 - Q(T)
  expectedRecoveryValue: number;   // Expected payoff on default
  creditSpreadBps: number;         // Fair zero-coupon credit spread in basis points
  firstPassageDensityAtT: number;  // Marginal default intensity / density at maturity
}

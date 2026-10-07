/**
 * Continuous RL & Volatility Surface Model Contracts
 *
 * @module desk/rl/continuous-rl-vol-types
 */

export interface MarketStateVector {
  readonly midPrice: number;
  readonly microPrice: number;
  readonly spreadBps: number;
  readonly orderBookImbalance: number;
  readonly kyleLambda: number;
  readonly vpinToxicity: number;
  readonly inventoryUnits: number;
}

export interface ContinuousAction {
  readonly bidSpreadMultiplier: number;
  readonly askSpreadMultiplier: number;
  readonly targetDeltaHedgeUnits: number;
}

export interface SabrParameters {
  readonly alpha: number; // Initial volatility level
  readonly beta: number;  // Elasticity / backbone exponent (typically 0.5 - 1.0)
  readonly rho: number;   // Correlation between asset price and volatility (-1 to 1)
  readonly nu: number;    // Volatility of volatility (vol-vol)
}

export interface VolatilityPoint {
  readonly strikePrice: number;
  readonly forwardPrice: number;
  readonly expiryYears: number;
  readonly impliedVol: number;
}

export type VolatilityRegime = 'LOW_VOL_CALM' | 'MEDIUM_VOL_NORMAL' | 'HIGH_VOL_STRESSED' | 'JUMP_DISCONTINUOUS';

export interface RegimeFilterState {
  readonly currentRegime: VolatilityRegime;
  readonly jumpProbability: number;
  readonly transitionIntensity: number;
  readonly smoothedVol: number;
}

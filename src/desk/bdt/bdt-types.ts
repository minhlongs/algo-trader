/**
 * Black-Derman-Toy (1990) Log-Normal Short-Rate Lattice Model Types
 */

export interface BDTModelParams {
  /** Yield curve zero coupon yields (or annualized forward rates) at integer steps */
  yieldCurve: number[];
  /** Short-rate volatility at each time step (annualized, e.g. 0.15 = 15%) */
  volatilities: number[];
  /** Time step size in years (dt, e.g. 1.0 or 0.25) */
  timeStep?: number;
}

export interface BDTRateNode {
  step: number;
  state: number; // 0 (lowest) to step (highest)
  rate: number;
}

export interface BDTTetherLattice {
  steps: number;
  rates: number[][]; // rates[step][state]
  discountFactors: number[];
}

export interface EuropeanBDTBondOptionParams {
  optionMaturityStep: number;
  bondMaturityStep: number;
  strikePrice: number;
  isCall: boolean;
}

export interface BDTBondOptionResult {
  optionPrice: number;
  underlyingBondPrice: number;
  latticeDepth: number;
  intrinsicValue: number;
  putCallParityDeviation?: number;
}

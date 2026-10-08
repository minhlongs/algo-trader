export interface SviParameters {
  a: number; // Vertical level
  b: number; // Slope of wings (b >= 0)
  rho: number; // Skew/rotation (-1 < rho < 1)
  m: number; // Horizontal translation
  sigma: number; // ATM curvature (> 0)
}

export interface VolatilitySlicePoint {
  strike: number;
  forward: number;
  logMoneyness: number; // k = ln(K/F)
  impliedVol: number; // Annualized vol (e.g. 0.20 for 20%)
  totalVariance: number; // w = impliedVol^2 * T
}

export interface SviFitResult {
  parameters: SviParameters;
  rmse: number;
  maxError: number;
  noButterflyArbitrage: boolean;
}

export interface LocalVolPoint {
  strike: number;
  expiryYears: number;
  localVol: number;
  impliedVol: number;
  totalVariance: number;
}

export interface ArbitrageCheckResult {
  hasCalendarArbitrage: boolean;
  hasButterflyArbitrage: boolean;
  violationsCount: number;
  minDurrlemanValue: number;
  details: string[];
}

/**
 * Wave 267: Obizhaeva, Wang & Wang (2020) High-Frequency Inventory Decomposition Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface Obizhaeva2020DecompConfig {
  readonly resilienceRateRho: number; // rho > 0: book recovery rate
  readonly informationWeightAlpha: number; // alpha in [0, 1]: permanent info fraction
  readonly impactIntensityLambda: number; // lambda > 0: instantaneous impact parameter
  readonly noiseVolatilitySigma: number; // sigma: uninformative noise
}

export interface TradeImpactDecompStep {
  readonly tradeIndex: number;
  readonly tradeSize: number; // x_k
  readonly transientComponent: number; // D_k
  readonly permanentComponent: number; // P_k
  readonly totalMarketPriceChange: number; // Delta S_k
  readonly bookRecoveryExpected: number;
}

export interface Obizhaeva2020DecompResult {
  readonly steps: readonly TradeImpactDecompStep[];
  readonly cumulativePermanentImpact: number;
  readonly residualTransientImpact: number;
  readonly informationalFraction: number;
}

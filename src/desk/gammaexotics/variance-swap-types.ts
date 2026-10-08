export interface VanillaOptionQuote {
  readonly strike: number;
  readonly impliedVol: number;
  readonly isCall: boolean;
  readonly marketPrice?: number;
}

export interface VarianceSwapSpec {
  readonly underlyingSpot: number;
  readonly riskFreeRate: number;
  readonly dividendYield: number;
  readonly expiryYears: number;
  readonly strikeVariance?: number; // K_var (annualized variance points)
  readonly notionalVariance?: number; // Vega notional or Var notional
}

export interface CorridorSpec {
  readonly lowerBarrier: number; // B_L
  readonly upperBarrier: number; // B_U
}

export interface VarianceSwapReplicationResult {
  readonly fairStrikeVariance: number; // Theoretical swap fair strike E[sigma^2]
  readonly fairVolatilityStrike: number; // sqrt(fairStrikeVariance)
  readonly logContractValue: number;
  readonly putStripIntegral: number;
  readonly callStripIntegral: number;
  readonly totalReplicationPrice: number;
}

export interface CorridorVarianceResult {
  readonly corridorVarianceFairStrike: number;
  readonly unconstrainedFairStrike: number;
  readonly corridorRatio: number;
}

export interface GammaSwapResult {
  readonly fairGammaStrike: number;
  readonly varianceSwapStrike: number;
  readonly convexityAdjustment: number;
}

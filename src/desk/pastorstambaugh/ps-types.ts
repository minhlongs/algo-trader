export interface PsStockObservation {
  returnNext: number; // r_{i, t+1}
  returnCurrent: number; // r_{i, t}
  marketReturnNext: number; // r_{m, t+1}
  dollarVolume: number; // Dollar volume v_{i, t}
  signedVolume: number; // sign(r^e_{i, t}) * v_{i, t}
}

export interface PsStockReversalResult {
  gamma: number; // Liquidity measure: coefficient on signed volume (typically negative)
  tStat: number; // t-statistic on gamma
  rSquared: number;
  sampleSize: number;
}

export interface PsMarketLiquiditySeries {
  month: number;
  averageGamma: number; // Equal-weighted or value-weighted average gamma across stocks
}

export interface PsInnovationResult {
  innovations: number[]; // Innovations from AR(1) or AR(2) model on market liquidity
  persistence: number; // Autoregressive parameter rho
  variance: number;
}

export interface PsLiquidityBetaResult {
  liquidityBeta: number; // Sensitivity of asset returns to aggregate liquidity innovations
  marketBeta: number;
  alpha: number;
  rSquared: number;
}

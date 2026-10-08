export interface CreditAsset {
  id: string;
  hazardRate: number;      // Continuous hazard rate lambda
  recoveryRate: number;    // Recovery rate R (e.g. 0.4)
  notional: number;        // Principal value
}

export interface LiCopulaPairParams {
  asset1: CreditAsset;
  asset2: CreditAsset;
  timeHorizon: number;     // T (in years)
  assetCorrelation: number;// rho (asset return correlation)
}

export interface LiCopulaResult {
  marginalDefaultProb1: number;
  marginalDefaultProb2: number;
  jointDefaultProbability: number;
  defaultCorrelation: number;
  expectedPortfolioLoss: number;
  copulaSurvivalProb: number;
}

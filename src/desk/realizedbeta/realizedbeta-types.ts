/**
 * Wave 209: Andersen, Bollerslev, Diebold & Wu (2006) Realized Beta Types.
 * Continuous and jump systemic risk decomposition in high-frequency cross-sectional assets.
 * Strictly < 180 LOC, zero :any.
 */

export interface RealizedBetaConfig {
  annualizationFactor: number;
  minObservations?: number;
  shrinkageIntensity?: number;
}

export interface RealizedBetaResult {
  sampleSize: number;
  realizedMarketVariance: number;
  realizedAssetVariance: number;
  realizedCovariance: number;
  realizedCorrelation: number;
  totalRealizedBeta: number;
  continuousBeta: number;
  jumpBeta: number;
  marketBipowerVariation: number;
  assetBipowerVariation: number;
  bipowerCovariance: number;
  systemicRiskFraction: number;
  idiosyncraticVariance: number;
  betaRegime: 'DEFENSIVE' | 'NEUTRAL' | 'AGGRESSIVE';
}

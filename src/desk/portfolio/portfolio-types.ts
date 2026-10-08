export interface AssetUniverse {
  symbols: string[];
  historicalReturns: number[][]; // N assets x T observations
}

export interface LedoitWolfResult {
  shrunkCovariance: number[][]; // N x N
  sampleCovariance: number[][]; // N x N
  shrinkageIntensity: number; // delta in [0, 1]
  averageCorrelation: number;
}

export interface RiskParityResult {
  weights: number[]; // N weights summing to 1.0
  marginalRiskContributions: number[];
  totalRiskContributions: number[];
  portfolioVolatilityPct: number;
  maxDisparityPct: number; // Max difference between any two risk contributions
  converged: boolean;
  iterations: number;
}

export interface FactorExposure {
  symbol: string;
  factorBeta: { [factorName: string]: number };
}

export interface FactorAttributionResult {
  totalVariancePct: number;
  factorRiskContributionPct: { [factorName: string]: number };
  specificRiskPct: number;
}

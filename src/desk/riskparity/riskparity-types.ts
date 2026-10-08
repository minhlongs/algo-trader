export interface FactorProfile {
  readonly factorName: string;
  readonly annualizedVolatilityPct: number;
}

export interface FactorCovarianceMatrix {
  readonly factors: string[];
  readonly matrix: number[][]; // Covariance matrix Sigma
}

export interface RiskParityResult {
  readonly weights: { factorName: string; weight: number }[];
  readonly portfolioVolPct: number;
  readonly marginalRiskContributions: { factorName: string; mcr: number }[];
  readonly percentRiskContributions: { factorName: string; riskPct: number }[];
  readonly isParityAchieved: boolean;
}

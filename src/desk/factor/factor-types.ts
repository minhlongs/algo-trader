/**
 * Factor Risk & Statistical Arbitrage Model Types
 *
 * @module desk/factor/factor-types
 */

export interface FactorExposureVector {
  readonly asset: string;
  readonly marketBeta: number;
  readonly sizeFactor: number;
  readonly valueFactor: number;
  readonly momentumFactor: number;
  readonly volatilityFactor: number;
}

export interface FactorAttributionResult {
  readonly asset: string;
  readonly totalReturnPct: number;
  readonly factorExplainedReturnPct: number;
  readonly specificResidualReturnPct: number;
  readonly factorContributions: Readonly<Record<string, number>>;
}

export interface IdiosyncraticRiskDecomposition {
  readonly asset: string;
  readonly totalVariance: number;
  readonly systematicVariance: number;
  readonly specificVariance: number;
  readonly rSquared: number;
}

export interface MarketNeutralOptimizationTarget {
  readonly targetGrossExposureUsd: number;
  readonly maxNetBetaExposure: number;
  readonly maxSingleNameWeight: number;
}

export interface PortfolioWeightAssignment {
  readonly asset: string;
  readonly weight: number;
  readonly allocatedCapitalUsd: number;
  readonly side: 'LONG' | 'SHORT';
}

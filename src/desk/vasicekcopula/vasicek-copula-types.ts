/**
 * Vasicek (2002) Asymptotic Single Risk Factor (ASRF) Copula Types
 *
 * @module desk/vasicekcopula
 */

export interface VasicekPortfolioConfig {
  readonly defaultProbabilityPct: number; // PD (%)
  readonly lossGivenDefaultPct: number;    // LGD (%)
  readonly assetCorrelation: number;       // rho in (0, 1)
  readonly totalExposureUsd?: number;      // Total Portfolio EAD
  readonly confidenceLevelPct?: number;    // e.g. 99.9% for Basel IRB
}

export interface VasicekLossDistributionPoint {
  readonly lossFractionPct: number;
  readonly cumulativeProbability: number;
  readonly lossDensity: number;
}

export interface VasicekPortfolioResult {
  readonly expectedLossPct: number;
  readonly expectedLossUsd: number;
  readonly creditVarPct: number;
  readonly creditVarUsd: number;
  readonly unexpectedLossPct: number;
  readonly unexpectedLossUsd: number;
  readonly expectedShortfallPct: number;
  readonly expectedShortfallUsd: number;
  readonly economicCapitalRatioPct: number;
  readonly defaultThresholdScore: number;
  readonly distributionSample: readonly VasicekLossDistributionPoint[];
}

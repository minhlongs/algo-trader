/**
 * Wave 236: Almgren, Thum, Hauptmann & Li (2005) Empirical Direct Estimation
 * Strictly < 150 LOC, zero :any.
 */

export interface AlmgrenEmpiricalConfig {
  readonly dailyVolatilitySigma: number;
  readonly averageDailyVolumeV: number;
  readonly sharesOutstandingN: number;
  readonly permanentFactorGamma: number;
  readonly temporaryFactorEta: number;
  readonly temporaryExponentAlpha: number; // typically 0.6
}

export interface EmpiricalOrderExecution {
  readonly totalSharesX: number;
  readonly durationDaysT: number;
}

export interface EmpiricalImpactCostAssessment {
  readonly permanentPriceImpactBps: number;
  readonly temporaryPriceImpactBps: number;
  readonly totalExecutionShortfallBps: number;
  readonly participationRate: number;
}

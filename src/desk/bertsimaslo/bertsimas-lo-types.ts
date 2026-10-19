/**
 * Bertsimas-Lo (1998) Dynamic Optimal Execution Types
 *
 * @module desk/bertsimaslo
 */

export interface BertsimasLoConfig {
  readonly initialShares: number;
  readonly periods: number;
  readonly initialPrice: number;
  readonly permanentImpactCoeff: number;
  readonly temporaryImpactCoeff: number;
  readonly informationPersistence?: number;
  readonly informationImpactCoeff?: number;
  readonly initialInformationState?: number;
  readonly isBuy?: boolean;
}

export interface ExecutionStep {
  readonly period: number;
  readonly tradeShares: number;
  readonly remainingShares: number;
  readonly expectedPermanentPrice: number;
  readonly expectedExecutedPrice: number;
  readonly periodCashFlow: number;
}

export interface BertsimasLoExecutionResult {
  readonly schedule: readonly ExecutionStep[];
  readonly totalCashFlow: number;
  readonly averageExecutedPrice: number;
  readonly benchmarkTwapCost: number;
  readonly benchmarkImmediateCost: number;
  readonly implementationShortfallUsd: number;
  readonly costSavingsVsTwapUsd: number;
  readonly costSavingsVsImmediateUsd: number;
  readonly totalPermanentImpact: number;
  readonly totalTemporaryImpact: number;
}

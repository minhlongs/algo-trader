/**
 * Merton (1971) Continuous-Time Optimal Portfolio & Consumption Types
 *
 * @module desk/mertonportfolio
 */

export interface MertonPortfolioConfig {
  readonly initialWealth: number;
  readonly riskFreeRatePct: number;
  readonly expectedReturnPct: number;
  readonly volatilityPct: number;
  readonly relativeRiskAversion: number;
  readonly discountRatePct: number;
  readonly timeHorizonYears: number;
  readonly terminalWealthWeight?: number;
  readonly steps?: number;
}

export interface MertonTrajectoryPoint {
  readonly timeYears: number;
  readonly optimalRiskyWeightPct: number;
  readonly optimalRiskFreeWeightPct: number;
  readonly optimalConsumptionRate: number;
  readonly optimalConsumptionPropensityPct: number;
  readonly expectedWealth: number;
}

export interface MertonPortfolioResult {
  readonly optimalRiskyWeightPct: number;
  readonly optimalRiskFreeWeightPct: number;
  readonly initialConsumptionRate: number;
  readonly initialConsumptionPropensityPct: number;
  readonly expectedTerminalWealth: number;
  readonly expectedUtility: number;
  readonly annualizedPortfolioDriftPct: number;
  readonly annualizedPortfolioVolatilityPct: number;
  readonly mertonRatio: number;
  readonly trajectory: readonly MertonTrajectoryPoint[];
}

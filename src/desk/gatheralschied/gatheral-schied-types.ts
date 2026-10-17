/**
 * Wave 239: Gatheral & Schied (2011) Optimal Execution under Geometric Brownian Motion
 * Strictly < 100 LOC, zero :any.
 */

export interface GatheralSchiedGbmConfig {
  readonly initialStockPriceS0: number;
  readonly annualDriftMu: number;
  readonly annualVolatilitySigma: number;
  readonly totalExecutionTimeT: number;
  readonly riskAversionFactor: number;
}

export interface GatheralSchiedExecutionSchedule {
  readonly timeGrid: readonly number[];
  readonly remainingInventory: readonly number[];
  readonly tradingRateTrajectory: readonly number[];
  readonly terminalInventory: number;
  readonly expectedImplementationShortfall: number;
}

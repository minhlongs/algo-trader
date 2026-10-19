/**
 * Gatheral & Wang (2012) Transient Market Impact Optimal Execution Types.
 */

export interface GatheralWangConfig {
  totalSharesX0: number;
  horizonSecT: number;
  decayRateRho: number;
  transientImpactGamma: number;
  riskAversionLambda?: number;
}

export interface GatheralWangSchedule {
  initialBlockTradeShares: number;
  terminalBlockTradeShares: number;
  continuousTradingRatePerSec: number;
  expectedExecutionCost: number;
}

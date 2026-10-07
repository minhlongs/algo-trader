/**
 * Binary Cross-Asset Portfolio Margin Types
 * Scenario simulation loss surface and tiered margin requirements.
 *
 * @module desk/clearing/portfolio-margin-types
 */

export interface BinaryPositionScenario {
  readonly marketId: string;
  readonly yesShares: number;
  readonly noShares: number;
  readonly markPrice: number;
  readonly impliedVol: number;
}

export type LiquidationTier =
  | 'NORMAL'
  | 'WARNING'
  | 'SOFT_DELEVERAGING'
  | 'HARD_LIQUIDATION';

export interface PortfolioMarginMetrics {
  readonly totalEquityUsd: number;
  readonly initialMarginReqUsd: number;
  readonly maintenanceMarginReqUsd: number;
  readonly marginUtilizationPct: number;
  readonly maxAllowableLeverage: number;
  readonly liquidationTier: LiquidationTier;
  readonly worstCaseLossUsd: number;
}

export interface MarginEngineConfig {
  readonly safetyBufferPct?: number; // e.g. 0.15 (15% buffer above worst case)
  readonly maintenanceRatio?: number; // e.g. 0.70 of IM
  readonly warningThresholdPct?: number; // e.g. 0.80 margin utilization
}

/**
 * Position PnL Attribution Types
 *
 * Contracts for decomposing realized and unrealized portfolio PnL
 * into alpha (directional price movement), spread capture, and fee friction.
 *
 * @module desk/portfolio/position-pnl-attribution-types
 */

export interface PositionAttributionInput {
  readonly positionId: string;
  readonly entryPrice: number;
  readonly exitOrMarkPrice: number;
  readonly quantity: number;
  readonly feesPaidUsd: number;
  readonly spreadCapturedPerUnit?: number;
}

export interface PnLAttributionBreakdown {
  readonly positionId: string;
  readonly totalGrossPnLUsd: number;
  readonly totalNetPnLUsd: number;
  readonly alphaPnLUsd: number;
  readonly spreadPnLUsd: number;
  readonly feeFrictionUsd: number;
  readonly returnOnCostPct: number;
}

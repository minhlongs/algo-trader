/**
 * Crypto Basis & Funding Rate Arb Desk Types
 *
 * @module desk/fundingarb/funding-types
 */

export interface PerpMarketQuote {
  readonly symbol: string;
  readonly markPrice: number;
  readonly indexPrice: number;
  readonly impactBidPrice: number;
  readonly impactAskPrice: number;
}

export interface FundingRateMetrics {
  readonly symbol: string;
  readonly premiumIndexPct: number;
  readonly eightHourFundingRatePct: number;
  readonly annualizedCarryApyPct: number;
  readonly isPayingLongs: boolean; // true if funding rate > 0
}

export interface DeltaNeutralPositionConfig {
  readonly capitalUsd: number;
  readonly spotPrice: number;
  readonly perpMarkPrice: number;
  readonly leverage: number; // e.g. 2x, 3x
  readonly maintenanceMarginPct: number; // e.g. 5.0%
}

export interface DeltaNeutralHedgeState {
  readonly spotQuantity: number;
  readonly perpShortQuantity: number;
  readonly netDeltaUsd: number;
  readonly liquidationPricePerp: number;
  readonly liquidationBufferPct: number;
  readonly isLiquidationRiskElevated: boolean;
  readonly projectedDailyYieldUsd: number;
}

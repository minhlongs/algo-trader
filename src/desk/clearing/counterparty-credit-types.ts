/**
 * Counterparty Credit Risk & Collateral Haircut Types
 * Contracts for Potential Future Exposure (PFE) and dynamic haircut models.
 *
 * @module desk/clearing/counterparty-credit-types
 */

export interface BilateralTradePosition {
  readonly tradeId: string;
  readonly markToMarketUsd: number;
  readonly notionalUsd: number;
  readonly annualizedVol: number;
  readonly timeToMaturityDays: number;
}

export interface CounterpartyCreditProfile {
  readonly counterpartyId: string;
  readonly creditRatingGrade: 'AAA' | 'AA' | 'A' | 'BBB' | 'SUB_INVESTMENT';
  readonly collateralHeldUsd: number;
  readonly collateralAssetType: 'USDC' | 'USDT' | 'ETH' | 'VOLATILE_TOKEN';
  readonly isWrongWayRiskExposed: boolean;
}

export interface CounterpartyExposureMetrics {
  readonly counterpartyId: string;
  readonly currentExposureUsd: number;
  readonly potentialFutureExposure99Usd: number;
  readonly effectiveHaircutPct: number;
  readonly netCollateralValueUsd: number;
  readonly netCreditRiskUsd: number;
  readonly isMarginCallTriggered: boolean;
}

export interface CreditSentinelConfig {
  readonly pfeConfidenceZ?: number; // 2.326 for 99%
  readonly baseHaircutUsdc?: number; // e.g. 0.02 (2%)
  readonly baseHaircutVolatile?: number; // e.g. 0.25 (25%)
}

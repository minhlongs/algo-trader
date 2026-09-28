/**
 * Risk Types & Interfaces
 * Pre-Trade Risk Gates, Quarter-Kelly Sizing & Drawdown Breakers
 * (Milestone 4 / Feature 12)
 */

export type RiskCheckVerdict = 'APPROVED' | 'REJECTED';

export type RiskRejectionCode =
  | 'KELLY_CAP_EXCEEDED'
  | 'MAX_POOL_EXPOSURE_EXCEEDED'
  | 'DAILY_DRAWDOWN_BREACH'
  | 'LATENCY_SPIKE_EXCEEDED';

export interface TradeIntent {
  intentId?: string;
  marketId?: string;
  poolId?: string;
  action?: 'BUY' | 'SELL' | 'SWAP' | 'MINT' | 'MERGE' | 'ARBITRAGE';
  notionalUsd: number;
  expectedEdgeBps?: number;
  venueLatencyMs?: number;
  outcomeIndex?: number;
  shares?: number;
}

export interface RiskContext {
  portfolioCapitalUsd?: number;
  portfolioEquityUsd?: number;
  peakDailyEquityUsd?: number;
  currentDailyEquityUsd?: number;
  currentDailyDrawdown?: number;
  venueLatencyMs?: number;
  currentPoolExposureUsd: number;
  maxPoolExposureLimitUsd?: number;
  openOrdersCount?: number;
}

export interface RiskGateConfig {
  maxQuarterKellyRatio: number;
  maxPoolExposureUsd: number;
  maxDailyDrawdownThreshold: number;
  maxVenueLatencyMs: number;
}

export interface RiskMetricsSummary {
  quarterKellyLimitUsd: number;
  currentDailyDrawdown: number;
  maxAllowedDrawdown: number;
  venueLatencyMs: number;
  poolExposureAfterTradeUsd: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  verdict: RiskCheckVerdict;
  allowedNotionalUsd: number;
  rejectionCode?: RiskRejectionCode;
  reason?: string;
  riskMetrics?: RiskMetricsSummary;
}

export interface KellySizingParams {
  winProbability: number;
  netOdds: number;
  portfolioCapital: number;
  maxQuarterFraction?: number; // defaults to 0.05 (5%)
}

export interface DrawdownState {
  peakCapitalUsd: number;
  currentCapitalUsd: number;
  currentDrawdown: number;
  maxDrawdownHurdle: number; // e.g. 0.15 (15%)
  tripped: boolean;
  trippedTimestampMs?: number;
}

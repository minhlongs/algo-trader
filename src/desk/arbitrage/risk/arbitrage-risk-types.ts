/**
 * Pre-trade risk guard types for multi-exchange arbitrage execution.
 *
 * @module desk/arbitrage/risk/arbitrage-risk-types
 */

export interface ArbitrageRiskConfig {
  /** Maximum fraction of bankroll allocated per trade (quarter-Kelly, default: 0.05 / 5%) */
  maxKellyFraction: number;
  /** Hard cap on single trade notional USD (default: $10,000) */
  maxTradeNotionalUsd: number;
  /** Maximum open exposure per symbol across all venues (default: $50,000) */
  maxSymbolExposureUsd: number;
  /** Maximum open exposure per venue (default: $100,000) */
  maxVenueExposureUsd: number;
  /** Maximum tolerable daily drawdown fraction (default: 0.15 / 15%) */
  maxDailyDrawdown: number;
  /** Maximum latency in ms before a venue is temporarily circuit-broken (default: 2000ms) */
  maxVenueLatencyMs: number;
  /** Minimum required net profit hurdle in basis points (default: 10 bps) */
  minHurdleBps: number;
  /** Operating mode: 'paper' | 'live' */
  mode: 'paper' | 'live';
}

export interface ArbitrageRiskCheckParams {
  symbol: string;
  buyVenue: string;
  sellVenue: string;
  tradeNotionalUsd: number;
  bankrollUsd: number;
  netProfitBps: number;
  winProbability?: number;
  winLossRatio?: number;
  currentDrawdown?: number;
  venueLatencies?: Record<string, number>;
  venueBalances?: Record<string, number>;
}

export interface ArbitrageRiskCheckResult {
  allowed: boolean;
  adjustedNotionalUsd: number;
  rejectionReason?:
    | 'DAILY_DRAWDOWN_EXCEEDED'
    | 'VENUE_LATENCY_BREACH'
    | 'INSUFFICIENT_VENUE_BALANCE'
    | 'MAX_TRADE_NOTIONAL_EXCEEDED'
    | 'MAX_SYMBOL_EXPOSURE_EXCEEDED'
    | 'MAX_VENUE_EXPOSURE_EXCEEDED'
    | 'BELOW_PROFIT_HURDLE'
    | 'LIVE_CREDENTIALS_INVALID'
    | 'CIRCUIT_BREAKER_ACTIVE';
  details?: Record<string, unknown>;
}

export const DEFAULT_ARBITRAGE_RISK_CONFIG: ArbitrageRiskConfig = {
  maxKellyFraction: 0.05,
  maxTradeNotionalUsd: 10_000,
  maxSymbolExposureUsd: 50_000,
  maxVenueExposureUsd: 100_000,
  maxDailyDrawdown: 0.15,
  maxVenueLatencyMs: 2_000,
  minHurdleBps: 10,
  mode: 'paper',
};

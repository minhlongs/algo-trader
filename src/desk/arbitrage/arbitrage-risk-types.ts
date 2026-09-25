/**
 * Pre-trade risk types and Zod schemas for multi-exchange arbitrage execution.
 *
 * @module desk/arbitrage/arbitrage-risk-types
 */

import { z } from 'zod';

// ── Rejection Reason Codes ──────────────────────────────────────────────────

export const ArbitrageRejectionReason = {
  DRAWDOWN_BREAKER_TRIPPED: 'DRAWDOWN_BREAKER_TRIPPED',
  VENUE_LATENCY_SPIKE: 'VENUE_LATENCY_SPIKE',
  EXCEEDS_KELLY_CAP: 'EXCEEDS_KELLY_CAP',
  EXCEEDS_NOTIONAL_CAP: 'EXCEEDS_NOTIONAL_CAP',
  EXCEEDS_VENUE_CAP: 'EXCEEDS_VENUE_CAP',
  EXCEEDS_SYMBOL_CAP: 'EXCEEDS_SYMBOL_CAP',
  INSUFFICIENT_VENUE_BALANCE: 'INSUFFICIENT_VENUE_BALANCE',
  MISSING_LIVE_CREDENTIALS: 'MISSING_LIVE_CREDENTIALS',
} as const;

export type ArbitrageRejectionReasonCode =
  (typeof ArbitrageRejectionReason)[keyof typeof ArbitrageRejectionReason];

export const ArbitrageRejectionReasonSchema = z.enum([
  'DRAWDOWN_BREAKER_TRIPPED',
  'VENUE_LATENCY_SPIKE',
  'EXCEEDS_KELLY_CAP',
  'EXCEEDS_NOTIONAL_CAP',
  'EXCEEDS_VENUE_CAP',
  'EXCEEDS_SYMBOL_CAP',
  'INSUFFICIENT_VENUE_BALANCE',
  'MISSING_LIVE_CREDENTIALS',
]);

// Aliases for ArbitrageRiskReason naming convention
export const ArbitrageRiskReason = ArbitrageRejectionReason;
export type ArbitrageRiskReason = ArbitrageRejectionReasonCode;
export type ArbitrageRiskReasonCode = ArbitrageRejectionReasonCode;
export const ArbitrageRiskReasonSchema = ArbitrageRejectionReasonSchema;


// ── Risk Configuration ──────────────────────────────────────────────────────

export interface ArbitrageRiskConfig {
  /** Total capital allocated to arbitrage desk in USDC */
  capitalUsdc: number;
  /** Hard cap on single trade notional USD across all legs */
  maxPerTradeNotionalUsd: number;
  /** Maximum open exposure per venue in USD */
  maxOpenPositionPerVenueUsd: number;
  /** Maximum open exposure per symbol across all venues in USD */
  maxOpenPositionPerSymbolUsd: number;
  /** Cumulative daily drawdown fraction threshold before halting (default: 0.15 / 15%) */
  maxDailyDrawdownFraction: number;
  /** Maximum latency in ms before venue is circuit-broken (default: 500ms) */
  maxVenueLatencyMs: number;
  /** Kelly fraction multiplier (default: 0.25 / Quarter-Kelly) */
  kellyFraction: number;
  /** Hard ceiling on single position fraction of capital (default: 0.05 / 5%) */
  maxKellyPositionFraction: number;
  /** Operating execution mode: 'paper' | 'live' */
  mode: 'paper' | 'live';
  /** Minimum required net profit hurdle in basis points (default: 10 bps) */
  minHurdleBps?: number;
  /** Whether to automatically clamp/downsize orders exceeding Kelly/notional caps instead of rejecting (default: false) */
  autoAdjustSizing?: boolean;
}

export const ArbitrageRiskConfigSchema = z.object({
  capitalUsdc: z.number().positive(),
  maxPerTradeNotionalUsd: z.number().positive(),
  maxOpenPositionPerVenueUsd: z.number().positive(),
  maxOpenPositionPerSymbolUsd: z.number().positive(),
  maxDailyDrawdownFraction: z.number().min(0).max(1).default(0.15),
  maxVenueLatencyMs: z.number().positive().default(500),
  kellyFraction: z.number().min(0.01).max(1).default(0.25),
  maxKellyPositionFraction: z.number().min(0.01).max(1).default(0.05),
  mode: z.enum(['paper', 'live']).default('paper'),
  minHurdleBps: z.number().min(0).default(10),
  autoAdjustSizing: z.boolean().default(false),
});

export const DEFAULT_ARBITRAGE_RISK_CONFIG: ArbitrageRiskConfig = {
  capitalUsdc: 100_000,
  maxPerTradeNotionalUsd: 10_000,
  maxOpenPositionPerVenueUsd: 50_000,
  maxOpenPositionPerSymbolUsd: 25_000,
  maxDailyDrawdownFraction: 0.15,
  maxVenueLatencyMs: 500,
  kellyFraction: 0.25,
  maxKellyPositionFraction: 0.05,
  mode: 'paper',
  minHurdleBps: 10,
  autoAdjustSizing: false,
};

// ── Multi-Leg Arbitrage Basket ──────────────────────────────────────────────

export type LegSide = 'buy' | 'sell' | 'BUY' | 'SELL';

export interface ArbitrageBasketLeg {
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  amount: number;
  price: number;
  notionalUsd?: number;
}

export const ArbitrageBasketLegSchema = z.object({
  legId: z.string(),
  venue: z.string(),
  symbol: z.string(),
  side: z.union([z.enum(['buy', 'sell']), z.enum(['BUY', 'SELL'])]),
  amount: z.number().positive(),
  price: z.number().positive(),
  notionalUsd: z.number().positive().optional(),
});

export interface MultiLegArbitrageBasket {
  basketId: string;
  opportunityId?: string;
  strategyKey?: string;
  legs: ArbitrageBasketLeg[];
  totalNotionalUsd?: number;
  expectedProfitUsd?: number;
  expectedProfitBps?: number;
  winProbability?: number;
  winLossRatio?: number;
  createdAt?: number;
}

export const MultiLegArbitrageBasketSchema = z.object({
  basketId: z.string(),
  opportunityId: z.string().optional(),
  strategyKey: z.string().optional(),
  legs: z.array(ArbitrageBasketLegSchema).min(1),
  totalNotionalUsd: z.number().positive().optional(),
  expectedProfitUsd: z.number().optional(),
  expectedProfitBps: z.number().optional(),
  winProbability: z.number().min(0).max(1).optional(),
  winLossRatio: z.number().positive().optional(),
  createdAt: z.number().optional(),
});

// ── Venue Balance Snapshot ──────────────────────────────────────────────────

export interface VenueBalanceSnapshot {
  venue: string;
  asset: string;
  free: number;
  locked?: number;
  total?: number;
  timestamp?: number;
}

export const VenueBalanceSnapshotSchema = z.object({
  venue: z.string(),
  asset: z.string(),
  free: z.number().nonnegative(),
  locked: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  timestamp: z.number().optional(),
});

// ── Pre-Trade Risk Evaluation Results ───────────────────────────────────────

export interface ArbitrageRiskGateChecks {
  drawdownBreakerOk: boolean;
  venueLatencyOk: boolean;
  kellyCapOk: boolean;
  notionalCapOk: boolean;
  venueCapOk: boolean;
  symbolCapOk: boolean;
  venueBalanceOk: boolean;
  credentialsOk: boolean;
}

export const ArbitrageRiskGateChecksSchema = z.object({
  drawdownBreakerOk: z.boolean(),
  venueLatencyOk: z.boolean(),
  kellyCapOk: z.boolean(),
  notionalCapOk: z.boolean(),
  venueCapOk: z.boolean(),
  symbolCapOk: z.boolean(),
  venueBalanceOk: z.boolean(),
  credentialsOk: z.boolean(),
});

export interface ArbitrageRiskCheckResult {
  allowed: boolean;
  rejectionReason?: ArbitrageRejectionReasonCode;
  adjustedNotionalUsd?: number;
  checks?: ArbitrageRiskGateChecks;
  details?: Record<string, unknown>;
}

export const ArbitrageRiskCheckResultSchema = z.object({
  allowed: z.boolean(),
  rejectionReason: ArbitrageRejectionReasonSchema.optional(),
  adjustedNotionalUsd: z.number().optional(),
  checks: ArbitrageRiskGateChecksSchema.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ── Evaluation Context ──────────────────────────────────────────────────────

export interface ArbitrageRiskContext {
  venueLatencies?: Record<string, number>;
  venueBalances?: Record<string, VenueBalanceSnapshot | number>;
  currentDrawdown?: number;
  portfolioValueUsd?: number;
  winProbability?: number;
  winLossRatio?: number;
  credentials?: Record<string, boolean | Record<string, string>>;
  autoAdjustSizing?: boolean;
}

// ── Legacy / Convenience Compat Types ───────────────────────────────────────

export interface ArbitrageRiskCheckParams {
  symbol: string;
  buyVenue: string;
  sellVenue: string;
  tradeNotionalUsd: number;
  bankrollUsd?: number;
  netProfitBps?: number;
  winProbability?: number;
  winLossRatio?: number;
  currentDrawdown?: number;
  venueLatencies?: Record<string, number>;
  venueBalances?: Record<string, number>;
}

/**
 * Risk Configuration Types and Schemas
 *
 * @module desk/arbitrage/risk/risk-types-config
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

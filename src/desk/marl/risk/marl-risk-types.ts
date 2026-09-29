/**
 * Pre-trade risk guard types and configuration schemas for MARL Market-Making.
 *
 * Enforces Quarter-Kelly sizing limits, daily drawdown circuit breakers,
 * max venue latency thresholds, and inventory exposure limits.
 *
 * @module desk/marl/risk/marl-risk-types
 */

import { z } from 'zod';

export const MarlRiskConfigSchema = z.object({
  /** Quarter-Kelly position limit ceiling (default 5%) */
  maxPositionFraction: z.number().min(0.01).max(0.2).default(0.05),
  /** Maximum allowable inventory notional value in USD across all active quotes */
  maxInventoryNotionalUsd: z.number().positive().default(50_000),
  /** Cumulative daily drawdown fraction threshold tripping circuit breaker (default 15%) */
  maxDailyDrawdownFraction: z.number().min(0.05).max(0.5).default(0.15),
  /** Maximum acceptable venue network/order-placement latency in milliseconds */
  maxVenueLatencyMs: z.number().positive().default(500),
  /** Master fail-safe switch enabling emergency shutdown on critical breach */
  emergencyHaltEnabled: z.boolean().default(true),
});

export type MarlRiskConfig = z.infer<typeof MarlRiskConfigSchema>;

export type MarlRiskRejectionCode =
  | 'DRAWDOWN_BREAKER_TRIPPED'
  | 'VENUE_LATENCY_SPIKE'
  | 'KELLY_CAP_EXCEEDED'
  | 'INVENTORY_LIMIT_EXCEEDED'
  | 'EMERGENCY_HALT_ACTIVE';

export interface MarlRiskEvaluationInput {
  quoteNotionalUsd: number;
  portfolioCapital: number;
  currentDailyDrawdown: number;
  venueLatencyMs: number;
  currentInventoryNotional: number;
  winRate?: number;
  payoutRatio?: number;
}

export interface MarlRiskEvaluationResult {
  approved: boolean;
  rejectionReason?: MarlRiskRejectionCode;
  quarterKellySizeUsd: number;
  currentDrawdownFraction: number;
  venueLatencyMs: number;
  circuitBroken: boolean;
}

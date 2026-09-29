/**
 * Risk Gate Checks and Evaluation Types and Schemas
 *
 * @module desk/arbitrage/risk/risk-types-evaluation
 */

import { z } from 'zod';
import {
  type ArbitrageRejectionReasonCode,
  ArbitrageRejectionReasonSchema,
} from './risk-types-config';
import type { VenueBalanceSnapshot } from './risk-types-basket';

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

/**
 * Execution reports, compensatory unwind schemas, state transition history, and PnL helpers.
 *
 * @module desk/arbitrage/execution/execution-types-reports
 */

import { z } from 'zod';
import {
  type LegSide,
  type LegExecutionStatus,
  type ExecutionState,
  LegSideSchema,
  LegExecutionStatusSchema,
  ExecutionStateSchema,
} from './execution-types-lifecycle';

export type { LegSide, LegExecutionStatus, ExecutionState };
export { LegSideSchema, LegExecutionStatusSchema, ExecutionStateSchema };

// ── Leg Execution Report ─────────────────────────────────────────────────────

export interface LegExecutionReport {
  legId: string;
  orderId?: string;
  clientOrderId?: string;
  venue: string;
  symbol: string;
  side: LegSide;
  requestedAmount: number;
  filledAmount: number;
  remainingAmount: number;
  price: number;
  avgFillPrice?: number;
  status: LegExecutionStatus;
  fee?: { amount: number; currency: string };
  latencyMs: number;
  error?: string;
}

export const LegExecutionReportSchema = z.object({
  legId: z.string().min(1),
  orderId: z.string().optional(),
  clientOrderId: z.string().optional(),
  venue: z.string().min(1),
  symbol: z.string().min(1),
  side: LegSideSchema,
  requestedAmount: z.number().nonnegative(),
  filledAmount: z.number().nonnegative(),
  remainingAmount: z.number().nonnegative(),
  price: z.number().nonnegative(),
  avgFillPrice: z.number().nonnegative().optional(),
  status: LegExecutionStatusSchema,
  fee: z.object({ amount: z.number().nonnegative(), currency: z.string() }).optional(),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});

// ── Compensatory Unwind Request & Target ─────────────────────────────────────

export interface UnwindLegTarget {
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  filledAmount: number;
  entryPrice: number;
  orderId?: string;
}

export const UnwindLegTargetSchema = z.object({
  legId: z.string().min(1),
  venue: z.string().min(1),
  symbol: z.string().min(1),
  side: LegSideSchema,
  filledAmount: z.number().positive(),
  entryPrice: z.number().positive(),
  orderId: z.string().optional(),
});

export interface CompensatoryUnwindRequest {
  unwindId?: string;
  executionId: string;
  legsToUnwind: UnwindLegTarget[];
  reason: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export const CompensatoryUnwindRequestSchema = z.object({
  unwindId: z.string().optional(),
  executionId: z.string().min(1),
  legsToUnwind: z.array(UnwindLegTargetSchema),
  reason: z.string().min(1),
  maxRetries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().positive().optional(),
});

// ── Unwind Result ────────────────────────────────────────────────────────────

export interface UnwindResult {
  unwindId: string;
  success: boolean;
  unwoundLegs: LegExecutionReport[];
  unhedgedResidualDelta: number;
  totalRealizedLossUsd: number;
  unwindCostUsd?: number;
  attempts: number;
  error?: string;
  timestamp: number;
}

export const UnwindResultSchema = z.object({
  unwindId: z.string().min(1),
  success: z.boolean(),
  unwoundLegs: z.array(LegExecutionReportSchema),
  unhedgedResidualDelta: z.number().nonnegative(),
  totalRealizedLossUsd: z.number().nonnegative(),
  unwindCostUsd: z.number().nonnegative().optional(),
  attempts: z.number().int().nonnegative(),
  error: z.string().optional(),
  timestamp: z.number().int().positive(),
});

// ── State Transition History ────────────────────────────────────────────────

export interface ExecutionStateTransition {
  from: ExecutionState;
  to: ExecutionState;
  timestamp: number;
  reason?: string;
}

export const ExecutionStateTransitionSchema = z.object({
  from: ExecutionStateSchema,
  to: ExecutionStateSchema,
  timestamp: z.number().int().positive(),
  reason: z.string().optional(),
});

// ── Multi-Leg Execution Report ───────────────────────────────────────────────

export interface MultiLegExecutionReport {
  executionId: string;
  opportunityId?: string;
  state: ExecutionState;
  stateHistory: ExecutionStateTransition[];
  legs: LegExecutionReport[];
  unwindResult?: UnwindResult;
  netRealizedPnlUsd?: number;
  slippageBps?: number;
  latencyMs: number;
  error?: string;
  timestamp: number;
}

export const MultiLegExecutionReportSchema = z.object({
  executionId: z.string().min(1),
  opportunityId: z.string().optional(),
  state: ExecutionStateSchema,
  stateHistory: z.array(ExecutionStateTransitionSchema),
  legs: z.array(LegExecutionReportSchema),
  unwindResult: UnwindResultSchema.optional(),
  netRealizedPnlUsd: z.number().optional(),
  slippageBps: z.number().optional(),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
  timestamp: z.number().int().positive(),
});

export type LegExecutionRecord = LegExecutionReport;
export type UnwindReport = UnwindResult;

// ── PnL Calculation Helper ──────────────────────────────────────────────────

/**
 * Calculates net realized PnL across executed legs.
 * Buy legs deduct notional + fee; sell legs add notional - fee.
 */
export function calculateMultiLegRealizedPnl(legs: LegExecutionReport[]): number {
  let buyOut = 0;
  let sellIn = 0;
  for (const leg of legs) {
    const fillPrice = leg.avgFillPrice ?? leg.price;
    const notional = leg.filledAmount * fillPrice;
    const fee = leg.fee ? leg.fee.amount : 0;
    if (leg.side === 'buy') {
      buyOut += notional + fee;
    } else {
      sellIn += notional - fee;
    }
  }
  return sellIn - buyOut;
}

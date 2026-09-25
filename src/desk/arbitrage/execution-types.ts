/**
 * Types, Zod schemas, and data structures for atomic multi-leg arbitrage execution.
 *
 * Enforces the formal 6-state execution lifecycle:
 * PENDING -> SUBMITTED -> FILLED | PARTIAL_UNWINDING -> UNWOUND | FAILED
 *
 * @module desk/arbitrage/execution-types
 */

import { z } from 'zod';

// ── 6-State Execution Lifecycle ──────────────────────────────────────────────

export type ExecutionState =
  | 'PENDING'
  | 'SUBMITTED'
  | 'FILLED'
  | 'PARTIAL_UNWINDING'
  | 'UNWOUND'
  | 'FAILED';

export const ExecutionStateSchema = z.enum([
  'PENDING',
  'SUBMITTED',
  'FILLED',
  'PARTIAL_UNWINDING',
  'UNWOUND',
  'FAILED',
]);

export type ExecutionMode = 'concurrent' | 'sequential';
export const ExecutionModeSchema = z.enum(['concurrent', 'sequential']);

export type LegSide = 'buy' | 'sell';
export const LegSideSchema = z.enum(['buy', 'sell']);

export type LegOrderType = 'market' | 'limit';
export const LegOrderTypeSchema = z.enum(['market', 'limit']);

export type LegExecutionStatus =
  | 'pending'
  | 'submitted'
  | 'filled'
  | 'partial'
  | 'failed'
  | 'canceled'
  | 'timed_out';

export const LegExecutionStatusSchema = z.enum([
  'pending',
  'submitted',
  'filled',
  'partial',
  'failed',
  'canceled',
  'timed_out',
]);

// ── Leg Order Specification ──────────────────────────────────────────────────

export interface LegOrderParams {
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  type: LegOrderType;
  amount: number;
  price: number;
  timeoutMs?: number;
  clientOrderId?: string;
}

export const LegOrderParamsSchema = z
  .object({
    legId: z.string().min(1, 'legId cannot be empty'),
    venue: z.string().min(1, 'venue cannot be empty'),
    symbol: z.string().min(1, 'symbol cannot be empty'),
    side: LegSideSchema,
    type: LegOrderTypeSchema.default('limit'),
    amount: z.number().positive('amount must be strictly positive'),
    price: z.number().positive('price must be strictly positive'),
    timeoutMs: z.number().positive('timeoutMs must be positive').optional(),
    clientOrderId: z.string().optional(),
  })
  .strict();

// ── Multi-Leg Arbitrage Order ────────────────────────────────────────────────

export interface MultiLegArbitrageOrder {
  orderId: string;
  opportunityId?: string;
  strategyKey?: string;
  executionMode?: ExecutionMode;
  legs: LegOrderParams[];
  maxTotalTimeoutMs?: number;
  timestamp?: number;
}

export const MultiLegArbitrageOrderSchema = z
  .object({
    orderId: z.string().min(1, 'orderId cannot be empty'),
    opportunityId: z.string().optional(),
    strategyKey: z.string().optional(),
    executionMode: ExecutionModeSchema.default('concurrent'),
    legs: z.array(LegOrderParamsSchema).min(1, 'Order must contain at least 1 leg'),
    maxTotalTimeoutMs: z.number().positive().optional(),
    timestamp: z.number().int().positive().optional(),
  })
  .strict();

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

// ── Compatibility Aliases ───────────────────────────────────────────────────

export type LegOrderSpec = LegOrderParams;
export type MultiLegExecutionPlan = MultiLegArbitrageOrder;
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

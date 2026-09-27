/**
 * Execution state lifecycle, order parameters, and multi-leg order specifications.
 *
 * @module desk/arbitrage/execution/execution-types-lifecycle
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

export type LegOrderSpec = LegOrderParams;
export type MultiLegExecutionPlan = MultiLegArbitrageOrder;

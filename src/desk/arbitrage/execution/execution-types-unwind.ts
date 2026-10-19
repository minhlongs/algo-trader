/**
 * Compensatory unwind and transition schemas for multi-leg arbitrage execution.
 *
 * @module desk/arbitrage/execution/execution-types-unwind
 */

import { z } from 'zod';
import {
  type LegSide,
  type ExecutionState,
  LegSideSchema,
  ExecutionStateSchema,
} from './execution-types-lifecycle';
import {
  type LegExecutionReport,
  LegExecutionReportSchema,
} from './execution-types-leg-report';

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

export type UnwindReport = UnwindResult;

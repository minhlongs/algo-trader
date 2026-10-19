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
import {
  type LegExecutionReport,
  LegExecutionReportSchema,
} from './execution-types-leg-report';
import {
  type UnwindLegTarget,
  type CompensatoryUnwindRequest,
  type UnwindResult,
  type ExecutionStateTransition,
  type UnwindReport,
  UnwindLegTargetSchema,
  CompensatoryUnwindRequestSchema,
  UnwindResultSchema,
  ExecutionStateTransitionSchema,
} from './execution-types-unwind';

export type { LegSide, LegExecutionStatus, ExecutionState };
export { LegSideSchema, LegExecutionStatusSchema, ExecutionStateSchema };

export type {
  UnwindLegTarget,
  CompensatoryUnwindRequest,
  UnwindResult,
  ExecutionStateTransition,
  UnwindReport,
};
export {
  UnwindLegTargetSchema,
  CompensatoryUnwindRequestSchema,
  UnwindResultSchema,
  ExecutionStateTransitionSchema,
};
export type { LegExecutionReport };
export { LegExecutionReportSchema };

// ── Leg Execution Report ─────────────────────────────────────────────────────

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

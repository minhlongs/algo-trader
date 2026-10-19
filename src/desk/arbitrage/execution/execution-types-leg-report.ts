/**
 * Leg execution report schema — isolated to break the circular dependency between
 * unwind schemas and the aggregate reports module.
 *
 * @module desk/arbitrage/execution/execution-types-leg-report
 */

import { z } from 'zod';
import {
  type LegSide,
  type LegExecutionStatus,
  LegSideSchema,
  LegExecutionStatusSchema,
} from './execution-types-lifecycle';

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

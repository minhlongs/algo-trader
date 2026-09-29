/**
 * Tri-Mode Execution Types & Schemas
 * Modes: PAPER, SHADOW, LIVE with strict isolation and telemetry metrics.
 */

import { z } from 'zod';
import { UnifiedTradeIntentSchema, VenueIdSchema } from '../orchestrator/orchestrator-types';

export const TriModeSchema = z.enum(['PAPER', 'SHADOW', 'LIVE']);
export type TriMode = z.infer<typeof TriModeSchema>;

export const DispatchStatusSchema = z.enum([
  'PENDING',
  'SUBMITTED',
  'PARTIALLY_FILLED',
  'FILLED',
  'REJECTED',
  'CANCELLED',
]);
export type DispatchStatus = z.infer<typeof DispatchStatusSchema>;

export const DispatchResultSchema = z.object({
  orderId: z.string().min(1),
  intentId: z.string().min(1),
  mode: TriModeSchema,
  venue: VenueIdSchema,
  status: DispatchStatusSchema,
  executedQuantity: z.number().nonnegative(),
  averagePrice: z.number().positive(),
  feeUsd: z.number().nonnegative(),
  slippageBps: z.number(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  error: z.string().optional(),
});
export type DispatchResult = z.infer<typeof DispatchResultSchema>;

export const OrderSliceSchema = z.object({
  sliceIndex: z.number().int().nonnegative(),
  totalSlices: z.number().int().positive(),
  quantity: z.number().positive(),
  targetTimestamp: z.number().int().positive(),
  delayMs: z.number().int().nonnegative(),
  executed: z.boolean(),
  executedPrice: z.number().positive().optional(),
});
export type OrderSlice = z.infer<typeof OrderSliceSchema>;

export interface ExecutionDispatcherOptions {
  readonly defaultMode?: TriMode;
  readonly defaultTakerFeeBps?: number;
  readonly simulatedLatencyMs?: number;
}

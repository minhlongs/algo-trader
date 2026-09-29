/**
 * Unified Orchestrator Data Contracts & Zod Schemas
 * Cross-Engine Unified Trading Loop & Execution Bridge (Milestone 1)
 */

import { z } from 'zod';
import { EngineIdSchema, type EngineId } from '../portfolio/types';
import { VenueIdSchema, type VenueId } from '../sor/sor-types';

export { EngineIdSchema, VenueIdSchema };
export type { EngineId, VenueId };

export const IntentUrgencySchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type IntentUrgency = z.infer<typeof IntentUrgencySchema>;

export const IntentOrderTypeSchema = z.enum([
  'MARKET',
  'LIMIT',
  'IOC',
  'TWO_SIDED_QUOTE',
  'MULTI_LEG_BUNDLE',
]);
export type IntentOrderType = z.infer<typeof IntentOrderTypeSchema>;

export const UnifiedTradeIntentSchema = z.object({
  intentId: z.string().min(1),
  engineId: EngineIdSchema,
  symbol: z.string().min(1),
  venue: VenueIdSchema,
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  urgency: IntentUrgencySchema,
  expectedEdgeBps: z.number().nonnegative(),
  expectedSharpe: z.number(),
  timeToExpiryMs: z.number().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  orderType: IntentOrderTypeSchema,
  isRiskReducing: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UnifiedTradeIntent = z.infer<typeof UnifiedTradeIntentSchema>;

export const IntentPrioritySchema = z.object({
  urgencyScore: z.number(),
  edgeScore: z.number(),
  sharpeScore: z.number(),
  expiryScore: z.number(),
  riskReductionBoost: z.number(),
  compositePriority: z.number(),
});
export type IntentPriority = z.infer<typeof IntentPrioritySchema>;

export const SyntheticFillSchema = z.object({
  fillId: z.string().min(1),
  intentId: z.string().min(1),
  engineId: EngineIdSchema,
  symbol: z.string().min(1),
  venue: VenueIdSchema,
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  fee: z.literal(0),
  slippage: z.literal(0),
  timestamp: z.number().int().nonnegative(),
});
export type SyntheticFill = z.infer<typeof SyntheticFillSchema>;

export const ResolutionTypeSchema = z.enum([
  'TIER_1_CROSS',
  'TIER_2_RISK_SUPREMACY',
  'TIER_3_PORTFOLIO_CONVICTION',
  'NO_CONFLICT',
]);
export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;

export const RejectedIntentSchema = z.object({
  intentId: z.string().min(1),
  engineId: EngineIdSchema,
  reason: z.string().min(1),
});
export type RejectedIntent = z.infer<typeof RejectedIntentSchema>;

export const ResolutionResultSchema = z.object({
  resolutionType: ResolutionTypeSchema,
  matchedQuantity: z.number().nonnegative(),
  midPrice: z.number().positive().optional(),
  syntheticFills: z.array(SyntheticFillSchema),
  residualIntents: z.array(UnifiedTradeIntentSchema),
  rejectedIntents: z.array(RejectedIntentSchema),
  reason: z.string(),
});
export type ResolutionResult = z.infer<typeof ResolutionResultSchema>;

export const QueueStatusSchema = z.object({
  depth: z.number().int().nonnegative(),
  maxCapacity: z.number().int().positive(),
  highUrgencyCount: z.number().int().nonnegative(),
  riskReducingCount: z.number().int().nonnegative(),
  shedCount: z.number().int().nonnegative(),
  oldestTimestamp: z.number().int().nonnegative().optional(),
  newestTimestamp: z.number().int().nonnegative().optional(),
});
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

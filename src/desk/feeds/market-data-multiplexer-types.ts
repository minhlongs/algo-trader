/**
 * Market Data Multiplexer Types & Zod Schemas
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import * as z from 'zod';
import {
  VenueIdSchema,
  type VenueId,
  type OrderBookLevel,
  type VenueBook,
} from '../sor/sor-types';
import type { VenueBookAggregator } from '../sor/venue-book-aggregator';

export { VenueIdSchema };
export type { VenueId, OrderBookLevel, VenueBook };

export const VenueTickSchema = z.object({
  venueId: VenueIdSchema,
  symbol: z.string().min(1),
  bid: z.number().positive(),
  ask: z.number().positive(),
  lastPrice: z.number().positive().optional(),
  timestamp: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
});
export type VenueTick = z.infer<typeof VenueTickSchema>;

export const TopOfBookSnapshotSchema = z.object({
  symbol: z.string().min(1),
  venueId: VenueIdSchema.optional(),
  bestBid: z.number().positive(),
  bestAsk: z.number().positive(),
  midPrice: z.number().positive(),
  spreadBps: z.number().nonnegative(),
  bidSize: z.number().nonnegative(),
  askSize: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  isStale: z.boolean(),
});
export type TopOfBookSnapshot = z.infer<typeof TopOfBookSnapshotSchema>;

export interface CpmmPoolParams {
  readonly symbol: string;
  readonly baseReserve: number;
  readonly quoteReserve: number;
  readonly feeBps?: number;
  readonly gasCostUsd?: number;
  readonly slices?: number;
  readonly maxDepthRatio?: number;
}

export interface LmsrPoolParams {
  readonly symbol: string;
  readonly liabilities: readonly number[];
  readonly b: number;
  readonly outcomeIndex: number;
  readonly feeBps?: number;
  readonly gasCostUsd?: number;
  readonly slices?: number;
  readonly maxDepthShares?: number;
}

export interface MultiplexerConfig {
  readonly venues?: readonly VenueId[];
  readonly autoSyncSorAggregator?: boolean;
  readonly sorAggregator?: VenueBookAggregator;
  readonly defaultTakerFeeBps?: Partial<Record<VenueId, number>>;
}

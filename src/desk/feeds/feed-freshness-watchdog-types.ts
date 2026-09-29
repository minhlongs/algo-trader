/**
 * Feed Freshness Watchdog Types & Zod Schemas
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import * as z from 'zod';
import type { VenueId } from '../sor/sor-types';

export const WatchdogStateSchema = z.enum(['HEALTHY', 'DEGRADED', 'TRIPPED']);
export type WatchdogState = z.infer<typeof WatchdogStateSchema>;

export const WatchdogTripEventSchema = z.object({
  reason: z.string().min(1),
  venueId: z.string().min(1),
  symbol: z.string().optional(),
  elapsedMs: z.number().nonnegative(),
  thresholdMs: z.number().positive(),
  timestamp: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
});
export type WatchdogTripEvent = z.infer<typeof WatchdogTripEventSchema>;

export const StaleFeedRecordSchema = z.object({
  venueId: z.string().min(1),
  symbol: z.string().min(1),
  elapsedMs: z.number().nonnegative(),
});
export type StaleFeedRecord = z.infer<typeof StaleFeedRecordSchema>;

export const FreshnessStatusSchema = z.object({
  isHealthy: z.boolean(),
  state: WatchdogStateSchema,
  staleFeeds: z.array(StaleFeedRecordSchema),
  checkedAt: z.number().int().nonnegative(),
  isStale: z.boolean().optional(),
  worstLatencyMs: z.number().nonnegative().optional(),
  staleVenues: z.array(z.string()).optional(),
});
export type FreshnessStatus = z.infer<typeof FreshnessStatusSchema>;

export interface EmergencyHaltable {
  triggerEmergencyHalt(reason?: string): void;
}

export interface FeedWatchdogOptions {
  readonly maxStalenessMs?: number; // default: 5,000ms
  readonly heartbeatIntervalMs?: number; // default: 1,000ms
  readonly checkIntervalMs?: number; // default: 250ms
  readonly warningThresholdMs?: number; // default: 2,000ms
  readonly emergencyHaltTimeoutMs?: number; // default: 100ms
  readonly haltOnTrip?: boolean; // default: true
  readonly onFeedStale?: (venue: string, latencyMs: number) => void;
  readonly onTrip?: (event: WatchdogTripEvent) => void;
}

export interface WatchdogTargetMultiplexer {
  on(event: 'tick', listener: (tick: { venueId: VenueId; symbol: string; timestamp: number }) => void): this;
  on(event: 'heartbeat', listener: (venueId: VenueId, timestamp: number) => void): this;
  on(event: 'heartbeatTimeout', listener: (venueId: VenueId, error?: Error) => void): this;
  on(event: 'error', listener: (venueId: VenueId, error: Error) => void): this;
}

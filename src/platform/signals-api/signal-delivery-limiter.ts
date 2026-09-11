/**
 * Signal Delivery Limiter & Queue Helpers
 * Tier-based sliding window rate limiter, timestamp delivery log tracking,
 * and subscriber queue event management.
 */

import type { FusionResult } from '../../desk/intelligence/signal-fusion-engine';
import { TIER_RATE_LIMITS } from './signal-subscription-service';
import type { TierLabel } from './signal-subscription-service';
import type { SignalEvent } from './signal-publisher-types';

/**
 * Check whether a subscriber can receive signals based on tier rate limit.
 * Counts deliveries within the rate limit window.
 */
export function canSendSignal(
  tier: TierLabel,
  subscriberId: string,
  rateLimitWindowMs: number,
  deliveryLog: Map<string, number[]>,
): boolean {
  const limit = TIER_RATE_LIMITS[tier];
  // -1 means unlimited
  if (limit === -1) return true;

  const now = Date.now();
  const windowStart = now - rateLimitWindowMs;
  const log = deliveryLog.get(subscriberId);
  if (!log) return limit > 0;

  // Purge entries outside the window
  const recent = log.filter((ts) => ts >= windowStart);
  deliveryLog.set(subscriberId, recent);

  return recent.length < limit;
}

/**
 * Record delivery timestamp for a subscriber.
 */
export function recordSignalDelivery(
  subscriberId: string,
  deliveryLog: Map<string, number[]>,
): void {
  const now = Date.now();
  let log = deliveryLog.get(subscriberId);
  if (!log) {
    log = [];
    deliveryLog.set(subscriberId, log);
  }
  log.push(now);
}

/**
 * Construct a SignalEvent from a constituent signal or fallback fusion result.
 */
export function buildSignalEvent(
  subscriberId: string,
  signal: { name: string; score: number } | null,
  result: FusionResult,
): SignalEvent {
  return {
    id: crypto.randomUUID(),
    subscriberId,
    signalName: signal?.name ?? result.direction,
    score: signal?.score ?? result.weightedScore,
    confidence: result.confidence,
    direction: result.direction,
    reasoning: result.reasoning,
    createdAt: Date.now(),
  };
}

/**
 * Push an event into subscriber's queue, trimming oldest if over max capacity.
 */
export function enqueueSignalEvent(
  queues: Map<string, SignalEvent[]>,
  subscriberId: string,
  event: SignalEvent,
  maxQueueSize: number,
): void {
  let queue = queues.get(subscriberId);
  if (!queue) {
    queue = [];
    queues.set(subscriberId, queue);
  }
  queue.push(event);

  if (queue.length > maxQueueSize) {
    queue.splice(0, queue.length - maxQueueSize);
  }
}

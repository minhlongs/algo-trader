/**
 * Freshness inspection and staleness calculation for FeedFreshnessWatchdog.
 *
 * @module desk/feeds/feed-freshness-inspector
 */

import type { FreshnessStatus, StaleFeedRecord, WatchdogState, WatchdogTripEvent } from './feed-freshness-watchdog-types';

export interface FreshnessScanInput {
  lastTickTimes: Map<string, number>;
  lastHeartbeatTimes: Map<string, number>;
  maxStalenessMs: number;
  warningThresholdMs: number;
  now: number;
}

export interface FreshnessScanResult {
  staleFeeds: StaleFeedRecord[];
  hasWarning: boolean;
  worstLatencyMs: number;
}

export function scanFeedFreshness(input: FreshnessScanInput): FreshnessScanResult {
  const staleFeeds: StaleFeedRecord[] = [];
  let hasWarning = false;
  let worstLatencyMs = 0;

  for (const [key, lastTick] of input.lastTickTimes.entries()) {
    const elapsed = Math.max(0, input.now - lastTick);
    if (elapsed > worstLatencyMs) worstLatencyMs = elapsed;
    const [venueId, symbol] = key.split(':');
    if (elapsed > input.maxStalenessMs) {
      staleFeeds.push({ venueId, symbol, elapsedMs: elapsed });
    } else if (elapsed > input.warningThresholdMs) {
      hasWarning = true;
    }
  }

  for (const [venueId, lastHb] of input.lastHeartbeatTimes.entries()) {
    const elapsed = Math.max(0, input.now - lastHb);
    if (elapsed > worstLatencyMs) worstLatencyMs = elapsed;
    if (elapsed > input.maxStalenessMs && !staleFeeds.some((f) => f.venueId === venueId)) {
      staleFeeds.push({ venueId, symbol: '*', elapsedMs: elapsed });
    } else if (elapsed > input.warningThresholdMs) {
      hasWarning = true;
    }
  }

  return { staleFeeds, hasWarning, worstLatencyMs };
}

export function buildFreshnessStatus(
  state: WatchdogState,
  scan: FreshnessScanResult,
  checkedAt: number,
): FreshnessStatus {
  const isStale = scan.staleFeeds.length > 0;
  const staleVenues = Array.from(new Set(scan.staleFeeds.map((f) => f.venueId)));
  return {
    isHealthy: state === 'HEALTHY',
    state,
    staleFeeds: scan.staleFeeds,
    checkedAt,
    isStale,
    worstLatencyMs: scan.worstLatencyMs,
    staleVenues,
  };
}

export function buildWatchdogTripEvent(
  reason: string,
  venue: string,
  symbol: string | undefined,
  elapsedMs: number,
  thresholdMs: number,
  timestamp = Date.now(),
): WatchdogTripEvent {
  return {
    reason,
    venueId: venue,
    symbol,
    elapsedMs,
    thresholdMs,
    timestamp,
    latencyMs: elapsedMs,
  };
}

export function computeVenueLag(
  lastTickTimes: Map<string, number>,
  lastHeartbeatTimes: Map<string, number>,
  venue: string,
  symbol?: string,
  now = Date.now(),
): number {
  if (symbol) {
    const last = lastTickTimes.get(`${venue}:${symbol}`);
    return last ? Math.max(0, now - last) : Infinity;
  }
  const lastHb = lastHeartbeatTimes.get(venue);
  return lastHb ? Math.max(0, now - lastHb) : Infinity;
}

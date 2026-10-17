/**
 * Freshness inspection and staleness calculation for FeedFreshnessWatchdog.
 *
 * @module desk/feeds/feed-freshness-inspector
 */

import type { StaleFeedRecord } from './feed-freshness-watchdog-types';

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

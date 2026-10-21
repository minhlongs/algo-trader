/**
 * Region Failover Selection
 *
 * Pure failover/recovery decision logic for the Region Health Monitor.
 * Keeps the monitor focused on lifecycle and probing while these helpers
 * answer "which region should be active now" from a status snapshot.
 */

import { logger } from '../shared/utils/logger';
import type { RegionStatus, FailoverConfig } from './region-health-types';

export interface FailoverOutcome {
  /** Region to activate, or null when no healthy candidate exists. */
  nextRegion: string | null;
  /** Region that was active before the failover (null when failing region was already stale). */
  previousRegion: string | null;
}

/**
 * Pick the lowest-latency healthy region other than the failing one.
 * Returns `{ nextRegion: null }` when no candidate is healthy.
 */
export function selectFailoverTarget(
  statuses: Map<string, RegionStatus>,
  failedRegion: string,
): FailoverOutcome {
  const healthyRegions = Array.from(statuses.values())
    .filter(s => s.healthy && s.region !== failedRegion);

  if (healthyRegions.length === 0) {
    logger.error('No healthy regions available for failover', 'RegionHealthMonitor');
    return { nextRegion: null, previousRegion: null };
  }

  const sorted = healthyRegions.sort((a, b) => a.latencyMs - b.latencyMs);
  return { nextRegion: sorted[0].region, previousRegion: failedRegion };
}

/**
 * Decide the next active region given the current active region and all statuses.
 * Returns null when the active region is healthy enough to stay (or no better
 * candidate exists).
 */
export function decideFailover(
  activeRegion: string,
  statuses: Map<string, RegionStatus>,
  config: FailoverConfig,
): FailoverOutcome | null {
  const active = statuses.get(activeRegion);
  if (!active) return null;
  if (active.consecutiveFailures < config.failoverThreshold) return null;

  const outcome = selectFailoverTarget(statuses, activeRegion);
  if (!outcome.nextRegion) return null;

  return { nextRegion: outcome.nextRegion, previousRegion: activeRegion };
}

/** Log a completed failover (or manual switch) and return the pair as a tuple. */
export function announceRegionChange(from: string, to: string, mode: 'failover' | 'manual'): void {
  const label = mode === 'failover' ? 'Failover complete' : 'Manual switch';
  logger.warn(`${label}: ${from} → ${to}`, 'RegionHealthMonitor');
}

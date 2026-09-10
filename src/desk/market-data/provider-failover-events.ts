// SPDX-License-Identifier: MIT
/**
 * Provider Failover Events
 * Pure event formatting, history trimming, and Prometheus metric dispatch
 */

import { FailoverEvent, MarketDataSource } from './provider-failover-types';
import { recordFailoverEvent as recordPrometheusFailoverEvent } from '../../platform/middleware/prometheus-metrics';

/**
 * Creates a new FailoverEvent record
 */
export function createFailoverEvent(
  fromProvider: MarketDataSource,
  toProvider: MarketDataSource,
  reason: string,
  triggeredBy: 'automatic' | 'manual'
): FailoverEvent {
  return {
    timestamp: Date.now(),
    fromProvider,
    toProvider,
    reason,
    triggeredBy,
  };
}

/**
 * Dispatches Prometheus metric for failover direction
 */
export function recordFailoverMetric(
  fromProvider: MarketDataSource,
  primaryProvider: MarketDataSource,
  _reason: string,
  _triggeredBy: 'automatic' | 'manual'
): void {
  const direction =
    fromProvider === primaryProvider
      ? 'primary_to_fallback'
      : 'fallback_to_primary';
  recordPrometheusFailoverEvent(fromProvider as string, direction);
}

/**
 * Prepends event to history and trims to maxHistory
 */
export function appendFailoverEvent(
  history: FailoverEvent[],
  event: FailoverEvent,
  maxHistory: number
): FailoverEvent[] {
  history.unshift(event);
  if (history.length > maxHistory) {
    return history.slice(0, maxHistory);
  }
  return history;
}

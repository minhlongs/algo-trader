// SPDX-License-Identifier: MIT
/**
 * SLA Tracker window state helpers
 * Window lifecycle helpers extracted from the SlaTracker class (S16 tranche 2 split).
 */

import type { MarketDataSource } from './types';
import type { WindowMetrics } from './sla-tracker-types';

/**
 * Ensure a provider has a window map in the tracker state.
 */
export function ensureProvider(
  providerMetrics: Map<MarketDataSource, Map<number, WindowMetrics>>,
  provider: MarketDataSource
): void {
  if (!providerMetrics.has(provider)) {
    providerMetrics.set(provider, new Map());
  }
}

/**
 * Get the window for a provider, creating it if missing.
 * Rolls the window over (resets counters) once its age reaches its length.
 */
export function getOrCreateWindow(
  providerMetrics: Map<MarketDataSource, Map<number, WindowMetrics>>,
  provider: MarketDataSource,
  windowHours: number,
  now: number
): WindowMetrics {
  const providerData = providerMetrics.get(provider)!;
  let window = providerData.get(windowHours);

  if (!window) {
    window = {
      windowHours,
      startTime: now,
      totalRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      latencySamples: [],
      expectedCandles: 0,
      receivedCandles: 0,
    };
    providerData.set(windowHours, window);
  }

  // Check if window needs to roll over
  const windowMs = windowHours * 60 * 60 * 1000;
  if (now - window.startTime >= windowMs) {
    // Reset window
    window.startTime = now;
    window.totalRequests = 0;
    window.failedRequests = 0;
    window.totalLatency = 0;
    window.latencySamples = [];
    window.expectedCandles = 0;
    window.receivedCandles = 0;
  }

  return window;
}

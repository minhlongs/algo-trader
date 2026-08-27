// SPDX-License-Identifier: MIT
/**
 * SLA Tracker scoring helpers
 * Pure functions extracted from the SlaTracker class (S16 tranche 2 split).
 * No side effects: no metrics emission, no mutation of inputs.
 */

import type { WindowMetrics, SlaWindowReport } from './sla-tracker-types';

/**
 * Compute a percentile value from an ascending-sorted sample array.
 * Linear interpolation between adjacent ranks.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] * (1 - (index - lower)) + sorted[upper] * (index - lower);
}

/**
 * Build the report for a single SLA window from its aggregated metrics.
 * Always reports windows that have collected data, even if not fully aged —
 * this allows real-time visibility into SLA metrics.
 */
export function buildWindowReport(window: WindowMetrics, windowHours: number, now: number): SlaWindowReport {
  // Window age is intentionally not used to gate reporting (see header note);
  // `now` is accepted to keep the signature stable for future age-based filtering.
  void now;

  const availability = window.totalRequests > 0
    ? ((window.totalRequests - window.failedRequests) / window.totalRequests) * 100
    : 100;

  const errorRate = window.totalRequests > 0
    ? window.failedRequests / window.totalRequests
    : 0;

  const avgLatency = window.latencySamples.length > 0
    ? window.totalLatency / window.latencySamples.length
    : 0;

  const sortedLatency = [...window.latencySamples].sort((a, b) => a - b);
  const latencyPercentiles = {
    p50: percentile(sortedLatency, 50),
    p95: percentile(sortedLatency, 95),
    p99: percentile(sortedLatency, 99),
  };

  const completeness = window.expectedCandles > 0
    ? (window.receivedCandles / window.expectedCandles) * 100
    : 100;

  return {
    windowHours,
    availability,
    errorRate,
    avgLatency,
    latencyPercentiles,
    completeness,
    totalRequests: window.totalRequests,
    failedRequests: window.failedRequests,
  };
}

/**
 * Weighted health score across all reported windows.
 * Availability: 40%, Latency: 30%, Error rate: 20%, Completeness: 10%.
 * Window weight decays with window length (1h: 1.0, 24h: 0.8, 168h: 0.5, else 0.2).
 */
export function calculateHealthScore(windows: Record<number, SlaWindowReport>): number {
  let totalScore = 0;
  let weightSum = 0;

  for (const [windowHoursStr, window] of Object.entries(windows)) {
    const windowHours = Number(windowHoursStr);
    const weight = windowHours <= 1 ? 1.0 : windowHours <= 24 ? 0.8 : windowHours <= 168 ? 0.5 : 0.2;

    // Availability score (0-100)
    const availabilityScore = Math.min(100, window.availability);

    // Latency score (inverse: lower latency = higher score)
    // Target: <100ms p95 = 100, >1000ms = 0
    const latencyScore = Math.max(0, 100 - (window.latencyPercentiles.p95 / 10));

    // Error rate score (inverse: lower error rate = higher score)
    const errorRateScore = Math.max(0, 100 - (window.errorRate * 10000)); // 1% error = 0 score

    // Completeness score
    const completenessScore = window.completeness;

    // Weighted average
    const windowScore =
      availabilityScore * 0.4 +
      latencyScore * 0.3 +
      errorRateScore * 0.2 +
      completenessScore * 0.1;

    totalScore += windowScore * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? totalScore / weightSum : 0;
}

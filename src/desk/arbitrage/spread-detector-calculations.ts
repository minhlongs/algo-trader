/**
 * Spread Detector Calculation Helpers
 * Pure calculation functions for fees, slippage, ML scoring,
 * and latency percentile computation. All functions are stateless
 * and easily unit-testable in isolation.
 */

import type { ExchangeLatency, ScanMetrics } from './spread-detector-types';
import {
  FEE_RATES,
  calculateFees,
  calculateSlippage,
  calculateOpportunityScore,
  createDefaultScoringModel,
} from './spread-detector-math-helpers';

export {
  FEE_RATES,
  calculateFees,
  calculateSlippage,
  calculateOpportunityScore,
  createDefaultScoringModel,
};

// -- Latency statistics ----------------------------------------------------

/**
 * Compute avg, p95, p99 from a sorted array of latency samples.
 * Assumes samples are already sorted ascending.
 */
export function computeLatencyStats(sortedSamples: number[]): {
  avg: number;
  p95: number;
  p99: number;
} {
  if (sortedSamples.length === 0) return { avg: 0, p95: 0, p99: 0 };

  const avg = sortedSamples.reduce((a, b) => a + b, 0) / sortedSamples.length;
  const p95 = sortedSamples[Math.floor(sortedSamples.length * 0.95)] ?? 0;
  const p99 = sortedSamples[Math.floor(sortedSamples.length * 0.99)] ?? 0;

  return { avg, p95, p99 };
}

// -- Scan metrics ----------------------------------------------------------

/**
 * Update running scan metrics with a new scan duration sample.
 * Keeps the last 1000 duration samples and recomputes percentiles.
 */
export function updateScanMetrics(metrics: ScanMetrics, scanDuration: number): void {
  metrics.totalScans++;
  metrics.scanDurations.push(scanDuration);

  if (metrics.scanDurations.length > 1000) metrics.scanDurations.shift();

  const sorted = [...metrics.scanDurations].sort((a, b) => a - b);
  const stats = computeLatencyStats(sorted);
  metrics.avgScanDurationMs = stats.avg;
  metrics.p95ScanDurationMs = stats.p95;
  metrics.p99ScanDurationMs = stats.p99;
}

// -- Exchange latency tracking --------------------------------------------

/**
 * Record a latency sample for an exchange and update running statistics.
 * Keeps the last 100 samples per exchange.
 */
export function recordExchangeLatencySample(
  samples: Map<string, number[]>,
  latencies: Map<string, ExchangeLatency>,
  exchange: string,
  latency: number
): void {
  if (!samples.has(exchange)) {
    samples.set(exchange, []);
  }

  const exchangeSamples = samples.get(exchange)!;
  exchangeSamples.push(latency);

  // Keep last 100 samples
  if (exchangeSamples.length > 100) exchangeSamples.shift();

  const sorted = [...exchangeSamples].sort((a, b) => a - b);
  const stats = computeLatencyStats(sorted);

  latencies.set(exchange, {
    exchange,
    avgLatency: stats.avg,
    p95Latency: stats.p95,
    p99Latency: stats.p99,
    successRate: 1,
    lastUpdate: Date.now(),
  });
}

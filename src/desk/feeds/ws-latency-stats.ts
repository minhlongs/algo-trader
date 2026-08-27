/**
 * WebSocket Latency Statistics Helpers
 * Pure functions for latency calculations
 */

import type { BaseWebSocketClient } from './websocket-client';

export interface LatencyStatsResult {
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p95Latency: number;
}

/**
 * Compute latency statistics from samples.
 * Pure function — no instance state.
 * @param samples Array of latency samples in milliseconds
 * @returns Object with avg, min, max, p95 latency
 */
export function computeLatencyStats(samples: number[]): LatencyStatsResult {
  if (samples.length === 0) {
    return { avgLatency: 0, minLatency: 0, maxLatency: 0, p95Latency: 0 };
  }

  const sum = samples.reduce((a, b) => a + b, 0);
  const avgLatency = sum / samples.length;

  const sorted = [...samples].sort((a, b) => a - b);
  const minLatency = sorted[0];
  const maxLatency = sorted[sorted.length - 1];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95Latency = sorted[p95Index] ?? 0;

  return { avgLatency, minLatency, maxLatency, p95Latency };
}

/**
 * Record a latency sample. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function recordLatency(this: BaseWebSocketClient, latency: number): void {
  if (!this.config.latencyTracking) return;

  // Keep last 1000 samples for p95 calculation
  if (this.stats.latencySamples.length >= 1000) {
    this.stats.latencySamples.shift();
  }
  this.stats.latencySamples.push(latency);

  // Update statistics
  this.stats.lastLatency = latency;
  this.stats.minLatency = Math.min(this.stats.minLatency, latency);
  this.stats.maxLatency = Math.max(this.stats.maxLatency, latency);

  // Periodically recalculate (e.g., every 100 updates) to avoid sorting on every tick
  if (this.stats.messageCount % 100 === 0) {
    this.recalculateLatencyStats();
  }
}
// SPDX-License-Identifier: MIT
/**
 * SLA Tracker types
 * Shared type definitions for the SLA tracker modules (S16 tranche 2 split).
 */

import type { MarketDataSource } from './types';

/**
 * SLA configuration
 */
export interface SlaTrackerConfig {
  /** Target availability percentage (default: 99.9) */
  targetAvailability: number;
  /** Time windows to track in hours (default: [1, 24, 168, 720]) */
  windows: number[];
  /** Whether to record metrics */
  enableMetrics: boolean;
}

/**
 * SLA window metrics aggregation
 */
export interface WindowMetrics {
  windowHours: number;
  startTime: number;
  totalRequests: number;
  failedRequests: number;
  totalLatency: number;
  latencySamples: number[];
  expectedCandles: number;
  receivedCandles: number;
}

/**
 * SLA window report
 */
export interface SlaWindowReport {
  windowHours: number;
  availability: number;
  errorRate: number;
  avgLatency: number;
  latencyPercentiles: { p50: number; p95: number; p99: number };
  completeness: number;
  totalRequests: number;
  failedRequests: number;
}

/**
 * SLA report
 */
export interface SlaReport {
  provider: MarketDataSource;
  windows: Record<number, SlaWindowReport>;
  healthScore: number;
  lastUpdate: number;
}

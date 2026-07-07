// SPDX-License-Identifier: MIT
/**
 * SLA Tracker
 * Tracks provider Service Level Agreement metrics across multiple time windows
 */

import type { MarketDataSource } from './types';
import {
  setProviderHealthScore,
  setProviderAvailability,
  setProviderErrorRate,
  recordSlaCompliance,
} from '../../platform/middleware/prometheus-metrics';

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
interface WindowMetrics {
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

/**
 * SLA Tracker
 *
 * Maintains sliding windows for provider SLA tracking including:
 * - Availability (success rate)
 * - Error rate
 * - Latency percentiles
 * - Data completeness
 */
export class SlaTracker {
  private config: Required<SlaTrackerConfig>;
  private providerMetrics: Map<MarketDataSource, Map<number, WindowMetrics>>;
  private readonly METRICS_UPDATE_INTERVAL = 60_000; // 1 minute

  constructor(config: Partial<SlaTrackerConfig> = {}) {
    this.config = {
      targetAvailability: config.targetAvailability ?? 99.9,
      windows: config.windows ?? [1, 24, 168, 720], // 1h, 24h, 7d, 30d
      enableMetrics: config.enableMetrics ?? true,
    };
    this.providerMetrics = new Map();
  }

  /**
   * Record a request result
   */
  recordRequest(provider: MarketDataSource, success: boolean, latencyMs: number): void {
    const now = Date.now();
    this.ensureProvider(provider);

    for (const windowHours of this.config.windows) {
      const windowMs = windowHours * 60 * 60 * 1000;
      const window = this.getOrCreateWindow(provider, windowHours, now);

      window.totalRequests++;
      if (!success) {
        window.failedRequests++;
      }
      window.totalLatency += latencyMs;
      window.latencySamples.push(latencyMs);

      // Trim latency samples if too large
      if (window.latencySamples.length > 1000) {
        window.latencySamples = window.latencySamples.slice(-500);
      }
    }

    this.updateMetrics(provider);
  }

  /**
   * Record candle completeness
   */
  recordCandleCompleteness(
    provider: MarketDataSource,
    symbol: string,
    timeframe: string,
    expected: number,
    received: number
  ): void {
    // For SLA purposes, we aggregate across all symbols/timeframes
    // Individual symbol tracking would be in GapDetector
    const now = Date.now();
    this.ensureProvider(provider);

    for (const windowHours of this.config.windows) {
      const window = this.getOrCreateWindow(provider, windowHours, now);
      window.expectedCandles += expected;
      window.receivedCandles += received;
    }

    this.updateMetrics(provider);
  }

  /**
   * Get SLA report for a provider
   */
  getSlaReport(provider: MarketDataSource): SlaReport | null {
    const providerData = this.providerMetrics.get(provider);
    if (!providerData) {
      return null;
    }

    const now = Date.now();
    const windows: Record<number, SlaWindowReport> = {};

    for (const [windowHours, window] of providerData) {
      // Always report windows that have collected data, even if not fully aged
      // This allows real-time visibility into SLA metrics
      // const windowMs = windowHours * 60 * 60 * 1000;
      // const age = now - window.startTime;
      // if (age < windowMs) {
      //   continue;
      // }

      const windowMs = windowHours * 60 * 60 * 1000;
      const age = now - window.startTime;

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
        p50: this.percentile(sortedLatency, 50),
        p95: this.percentile(sortedLatency, 95),
        p99: this.percentile(sortedLatency, 99),
      };

      const completeness = window.expectedCandles > 0
        ? (window.receivedCandles / window.expectedCandles) * 100
        : 100;

      windows[windowHours] = {
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

    const healthScore = this.calculateHealthScore(provider, windows);
    const lastUpdate = now;

    // Cache health score in metrics
    if (this.config.enableMetrics) {
      setProviderHealthScore(provider as string, healthScore);
    }

    return {
      provider,
      windows,
      healthScore,
      lastUpdate,
    };
  }

  /**
   * Check if provider meets SLA target for a specific window
   */
  meetsSlaTarget(provider: MarketDataSource, windowHours: number = 24): boolean {
    const report = this.getSlaReport(provider);
    if (!report) {
      return false;
    }

    const windowReport = report.windows[windowHours];
    if (!windowReport) {
      return false;
    }

    const meetsAvailability = windowReport.availability >= this.config.targetAvailability;
    const meetsLatency = windowReport.avgLatency < 1000; // 1 second threshold

    return meetsAvailability && meetsLatency;
  }

  /**
   * Reset metrics for a provider
   */
  reset(provider: MarketDataSource): void {
    const providerData = this.providerMetrics.get(provider);
    if (providerData) {
      // Reset each window to initial state instead of deleting
      for (const [windowHours, window] of providerData) {
        window.totalRequests = 0;
        window.failedRequests = 0;
        window.totalLatency = 0;
        window.latencySamples = [];
        window.expectedCandles = 0;
        window.receivedCandles = 0;
        window.startTime = Date.now();
      }
    }
    if (this.config.enableMetrics) {
      setProviderHealthScore(provider as string, 0);
    }
  }

  /**
   * Get reports for all tracked providers
   */
  getAllReports(): SlaReport[] {
    const reports: SlaReport[] = [];
    for (const [provider] of this.providerMetrics) {
      const report = this.getSlaReport(provider);
      if (report) {
        reports.push(report);
      }
    }
    return reports;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureProvider(provider: MarketDataSource): void {
    if (!this.providerMetrics.has(provider)) {
      this.providerMetrics.set(provider, new Map());
    }
  }

  private getOrCreateWindow(provider: MarketDataSource, windowHours: number, now: number): WindowMetrics {
    const providerData = this.providerMetrics.get(provider)!;
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

  private updateMetrics(provider: MarketDataSource): void {
    if (!this.config.enableMetrics) return;

    const report = this.getSlaReport(provider);
    if (!report) return;

    // Update gauges for each window
    for (const [windowHoursStr, window] of Object.entries(report.windows)) {
      const windowHours = Number(windowHoursStr);
      setProviderAvailability(provider as string, window.availability / 100);
      setProviderErrorRate(provider as string, window.errorRate);
      recordSlaCompliance(provider as string, window.availability >= this.config.targetAvailability);
    }
  }

  private calculateHealthScore(provider: MarketDataSource, windows: Record<number, SlaWindowReport>): number {
    // Weighted health score calculation
    // Availability: 40%, Latency: 30%, Error rate: 20%, Completeness: 10%
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

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }
    return sorted[lower] * (1 - (index - lower)) + sorted[upper] * (index - lower);
  }
}

/**
 * Singleton instance
 */
let slaTrackerInstance: SlaTracker | null = null;

export function getSlaTracker(): SlaTracker {
  if (!slaTrackerInstance) {
    slaTrackerInstance = new SlaTracker();
  }
  return slaTrackerInstance;
}

export function initializeSlaTracker(config?: Partial<SlaTrackerConfig>): SlaTracker {
  slaTrackerInstance = new SlaTracker(config);
  return slaTrackerInstance;
}

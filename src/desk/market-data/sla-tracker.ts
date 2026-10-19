// SPDX-License-Identifier: MIT
/**
 * SLA Tracker (facade)
 * Tracks provider Service Level Agreement metrics across multiple time windows.
 * Split modules: sla-tracker-types.ts, sla-tracker-scoring.ts,
 * sla-tracker-state.ts, sla-tracker-metrics.ts (S16 tranche 2).
 */

import type { MarketDataSource } from './types';
import { setProviderHealthScore } from '../../platform/middleware/prometheus-metrics';
import type {
  SlaTrackerConfig,
  WindowMetrics,
  SlaWindowReport,
  SlaReport,
} from './sla-tracker-types';
import {
  buildWindowReport,
  calculateHealthScore,
  buildProviderSlaReport,
  doesWindowMeetSlaTarget,
} from './sla-tracker-scoring';
import {
  recordRequestInWindows,
  recordCandlesInWindows,
  resetProviderWindows,
} from './sla-tracker-state';
import { updateProviderMetrics } from './sla-tracker-metrics';

export type { SlaTrackerConfig, SlaWindowReport, SlaReport } from './sla-tracker-types';
export { buildWindowReport, calculateHealthScore, buildProviderSlaReport, doesWindowMeetSlaTarget };

/**
 * SLA Tracker — maintains sliding windows for provider SLA tracking:
 * availability (success rate), error rate, latency percentiles, data completeness.
 */
export class SlaTracker {
  private config: Required<SlaTrackerConfig>;
  private providerMetrics: Map<MarketDataSource, Map<number, WindowMetrics>>;

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
    recordRequestInWindows(this.providerMetrics, provider, this.config.windows, success, latencyMs);
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
    recordCandlesInWindows(this.providerMetrics, provider, this.config.windows, expected, received);
    this.updateMetrics(provider);
  }

  /**
   * Get SLA report for a provider
   */
  getSlaReport(provider: MarketDataSource): SlaReport | null {
    const providerData = this.providerMetrics.get(provider);
    if (!providerData) return null;

    const report = buildProviderSlaReport(provider, providerData);
    if (this.config.enableMetrics) {
      setProviderHealthScore(provider as string, report.healthScore);
    }
    return report;
  }

  /**
   * Check if provider meets SLA target for a specific window
   */
  meetsSlaTarget(provider: MarketDataSource, windowHours: number = 24): boolean {
    return doesWindowMeetSlaTarget(this.getSlaReport(provider), windowHours, this.config.targetAvailability);
  }

  /**
   * Reset metrics for a provider
   */
  reset(provider: MarketDataSource): void {
    resetProviderWindows(this.providerMetrics, provider);
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

  private updateMetrics(provider: MarketDataSource): void {
    if (!this.config.enableMetrics) return;
    updateProviderMetrics(provider, this.config.targetAvailability, this.getSlaReport(provider));
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

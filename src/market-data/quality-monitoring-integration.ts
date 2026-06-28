// SPDX-License-Identifier: MIT
/**
 * Quality Monitoring Integration
 * Orchestrates all data quality monitoring components
 */

import { logger } from '../utils/logger.js';
import { MarketDataSource, Candle, QualityReport, ProviderQualityConfig } from './types.js';
import { GapDetector, getGapDetector } from './gap-detector.js';
import { OutlierDetector, getOutlierDetector } from './outlier-detection.js';
import { SlaTracker, getSlaTracker } from './sla-tracker.js';
import { FailoverManager } from './provider-failover.js';
import type { GapStats } from './gap-detector.js';

/**
 * Quality monitoring integration
 *
 * Wraps market data providers with quality monitoring:
 * - Gap detection
 * - Outlier detection
 * - SLA tracking
 * - Failover management
 */
export class QualityMonitoringIntegration {
  private gapDetector: GapDetector;
  private outlierDetector: OutlierDetector;
  private slaTracker: SlaTracker;
  private failoverManagers: Map<string, FailoverManager>;
  private providerConfigs: Map<MarketDataSource, ProviderQualityConfig>;
  private initialized: boolean;

  constructor() {
    this.gapDetector = getGapDetector();
    this.outlierDetector = getOutlierDetector();
    this.slaTracker = getSlaTracker();
    this.failoverManagers = new Map();
    this.providerConfigs = new Map();
    this.initialized = false;
  }

  /**
   * Initialize quality monitoring for all configured providers
   */
  async initializeAll(configs: Record<string, ProviderQualityConfig>): Promise<void> {
    logger.info('QualityMonitoringIntegration: Initializing with provider configs', { providerCount: Object.keys(configs).length });

    for (const [name, config] of Object.entries(configs)) {
      this.providerConfigs.set(config.provider, config);

      // Start gap tracking for this provider if enabled
      if (config.enableGapDetection) {
        // Gap tracking started per symbol/timeframe when data arrives
      }

      // Setup failover if secondary provider specified
      if (config.failoverTarget) {
        this.setupFailover(config);
      }
    }

    this.initialized = true;
    logger.info('QualityMonitoringIntegration: Initialization complete');
  }

  /**
   * Get active provider for a data type
   */
  getActiveProvider(dataType: string): MarketDataSource | null {
    // Find failover manager for this data type
    for (const [key, manager] of this.failoverManagers) {
      return manager.getActiveProvider();
    }

    // If no failover, return first provider from configs
    const firstConfig = this.providerConfigs.values().next().value;
    return firstConfig?.provider ?? null;
  }

  /**
   * Record successful request
   */
  recordRequestSuccess(
    providerName: string,
    symbol: string,
    operation: string,
    latencyMs: number
  ): void {
    const provider = this.parseProvider(providerName);
    if (!provider) return;

    // Record in SLA tracker
    this.slaTracker.recordRequest(provider, true, latencyMs);

    // Record in failover manager if exists
    const failoverKey = this.getFailoverKey(provider);
    if (failoverKey) {
      const manager = this.failoverManagers.get(failoverKey);
      manager?.recordRequestResult(true, latencyMs);
    }
  }

  /**
   * Record failed request
   */
  recordRequestFailure(
    providerName: string,
    symbol: string,
    operation: string,
    error?: Error
  ): void {
    const provider = this.parseProvider(providerName);
    if (!provider) return;

    // Record in SLA tracker
    this.slaTracker.recordRequest(provider, false, 0);

    // Record in failover manager if exists
    const failoverKey = this.getFailoverKey(provider);
    if (failoverKey) {
      const manager = this.failoverManagers.get(failoverKey);
      manager?.recordRequestResult(false, 0);
    }

    logger.warn('QualityMonitoring: Request failed', { provider, symbol, operation, error: error?.message });
  }

  /**
   * Record received candle
   */
  recordCandle(
    providerName: string,
    symbol: string,
    timeframe: string,
    candle: Candle,
    receivedAt?: number
  ): void {
    const provider = this.parseProvider(providerName);
    if (!provider) return;

    const receivedTime = receivedAt ?? Date.now();

    // Record in gap detector
    this.gapDetector.recordCandle(provider as string, symbol, timeframe, candle);

    // Record in outlier detector
    this.outlierDetector.addCandle(candle, provider);

    // Track completeness in SLA
    this.slaTracker.recordCandleCompleteness(
      provider,
      symbol,
      timeframe,
      1, // expected one candle
      1  // received one candle
    );
  }

  /**
   * Get quality report for a provider
   */
  getQualityReport(providerName: string): QualityReport | null {
    const provider = this.parseProvider(providerName);
    if (!provider) return null;

    const config = this.providerConfigs.get(provider);
    if (!config) return null;

    // Get SLA report
    const slaReport = this.slaTracker.getSlaReport(provider);

    // Get gap statistics for all tracked symbols/timeframes
    const allGapStats = this.gapDetector.getAllStats();
    const providerGapStats = allGapStats.filter(
      stats => stats.provider === provider as string
    );

    // Count outliers (would need symbol-specific tracking for accuracy)
    const outlierCount = 0; // Placeholder - would query outlier detector

    // Get active status from failover manager if exists
    const failoverKey = this.getFailoverKey(provider);
    let isActive = true; // Default active
    if (failoverKey) {
      const manager = this.failoverManagers.get(failoverKey);
      isActive = manager?.getActiveProvider() === provider;
    }

    // Calculate overall health score
    const healthScore = slaReport?.healthScore ?? 100;

    return {
      provider,
      slaReport,
      gapStats: providerGapStats,
      outlierCount,
      healthScore,
      isActive,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Get all quality reports
   */
  getAllReports(): QualityReport[] {
    const reports: QualityReport[] = [];

    for (const [provider] of this.providerConfigs) {
      const report = this.getQualityReport(provider as string);
      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }

  /**
   * Check if provider meets quality thresholds
   */
  meetsQualityThreshold(providerName: string): boolean {
    const report = this.getQualityReport(providerName);
    if (!report) return false;

    const config = this.providerConfigs.get(report.provider);
    if (!config) return false;

    // Check against config thresholds
    if (config.minAvailability && report.slaReport) {
      const window24h = report.slaReport.windows[24];
      if (window24h && window24h.availability < config.minAvailability) {
        return false;
      }
    }

    if (config.maxLatencyMs && report.slaReport) {
      const window24h = report.slaReport.windows[24];
      if (window24h && window24h.avgLatency > config.maxLatencyMs) {
        return false;
      }
    }

    // Health score threshold (derived from above metrics)
    return report.healthScore >= 80;
  }

  /**
   * Stop all monitoring
   */
  shutdown(): void {
    for (const manager of this.failoverManagers.values()) {
      manager.stop();
    }
    this.failoverManagers.clear();
    logger.info('QualityMonitoringIntegration: Shutdown complete');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private setupFailover(config: ProviderQualityConfig): void {
    if (!config.failoverTarget) return;

    const key = this.getFailoverKey(config.provider);
    if (!key) return;

    // Don't create duplicate failover managers
    if (this.failoverManagers.has(key)) {
      return;
    }

    const failoverConfig = {
      primary: config.provider,
      secondary: config.failoverTarget,
      failureThreshold: 3,
      failbackCooldownMs: 5 * 60 * 1000,
      recoveryTimeMs: 60 * 1000,
      enableAutoFailback: true,
      healthCheckIntervalMs: 10_000,
    };

    const manager = new FailoverManager(failoverConfig);
    this.failoverManagers.set(key, manager);

    logger.info('QualityMonitoringIntegration: Failover setup', {
      primary: config.provider,
      secondary: config.failoverTarget,
    });
  }

  private parseProvider(providerName: string): MarketDataSource | null {
    try {
      return MarketDataSource[providerName.toUpperCase() as keyof typeof MarketDataSource] ??
             (Object.values(MarketDataSource) as string[]).includes(providerName as any)
        ? (providerName as any as MarketDataSource)
        : null;
    } catch {
      return null;
    }
  }

  private getFailoverKey(provider: MarketDataSource): string | null {
    // Check if this provider is a primary in any failover pair
    for (const [key, manager] of this.failoverManagers) {
      const active = manager.getActiveProvider();
      if (active === provider) {
        return key;
      }
    }
    return null;
  }
}

/**
 * Singleton instance
 */
let qualityIntegrationInstance: QualityMonitoringIntegration | null = null;

export function getQualityMonitoringIntegration(): QualityMonitoringIntegration {
  if (!qualityIntegrationInstance) {
    qualityIntegrationInstance = new QualityMonitoringIntegration();
  }
  return qualityIntegrationInstance;
}

export async function initializeQualityMonitoring(config?: Record<string, ProviderQualityConfig>): Promise<QualityMonitoringIntegration> {
  qualityIntegrationInstance = new QualityMonitoringIntegration();
  if (config) {
    await qualityIntegrationInstance.initializeAll(config);
  }
  return qualityIntegrationInstance;
}

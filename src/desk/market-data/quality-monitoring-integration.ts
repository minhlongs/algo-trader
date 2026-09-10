// SPDX-License-Identifier: MIT
/**
 * Quality Monitoring Integration
 * Orchestrates all data quality monitoring components
 */

import { logger } from '../../shared/utils/logger';
import { MarketDataSource, Candle, QualityReport, ProviderQualityConfig } from './types';
import { GapDetector, getGapDetector } from './gap-detector';
import { OutlierDetector, getOutlierDetector } from './outlier-detection';
import { SlaTracker, getSlaTracker } from './sla-tracker';
import { FailoverManager } from './provider-failover';
import {
  parseProvider,
  getFailoverKey,
  setupFailover,
  getActiveProvider,
} from './quality-monitoring-failover-init';
import {
  getQualityReport,
  getAllReports,
  meetsQualityThreshold,
} from './quality-monitoring-reporting';

export * from './quality-monitoring-failover-init';
export * from './quality-monitoring-reporting';

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

  async initializeAll(configs: Record<string, ProviderQualityConfig>): Promise<void> {
    logger.info('QualityMonitoringIntegration: Initializing with provider configs', {
      providerCount: Object.keys(configs).length,
    });

    for (const [, config] of Object.entries(configs)) {
      this.providerConfigs.set(config.provider, config);

      if (config.failoverTarget) {
        setupFailover(this.failoverManagers, config);
      }
    }

    this.initialized = true;
    logger.info('QualityMonitoringIntegration: Initialization complete');
  }

  getActiveProvider(dataType: string): MarketDataSource | null {
    return getActiveProvider(this.failoverManagers, this.providerConfigs, dataType);
  }

  recordRequestSuccess(
    providerName: string,
    _symbol: string,
    _operation: string,
    latencyMs: number
  ): void {
    const provider = parseProvider(providerName);
    if (!provider) return;

    this.slaTracker.recordRequest(provider, true, latencyMs);

    const failoverKey = getFailoverKey(this.failoverManagers, provider);
    if (failoverKey) {
      const manager = this.failoverManagers.get(failoverKey);
      manager?.recordRequestResult(true, latencyMs);
    }
  }

  recordRequestFailure(
    providerName: string,
    symbol: string,
    operation: string,
    error?: Error
  ): void {
    const provider = parseProvider(providerName);
    if (!provider) return;

    this.slaTracker.recordRequest(provider, false, 0);

    const failoverKey = getFailoverKey(this.failoverManagers, provider);
    if (failoverKey) {
      const manager = this.failoverManagers.get(failoverKey);
      manager?.recordRequestResult(false, 0);
    }

    logger.warn('QualityMonitoring: Request failed', { provider, symbol, operation, error: error?.message });
  }

  recordCandle(
    providerName: string,
    symbol: string,
    timeframe: string,
    candle: Candle,
    _receivedAt?: number
  ): void {
    const provider = parseProvider(providerName);
    if (!provider) return;

    this.gapDetector.recordCandle(provider as string, symbol, timeframe, candle);
    this.outlierDetector.addCandle(candle, provider);
    this.slaTracker.recordCandleCompleteness(provider, symbol, timeframe, 1, 1);
  }

  getQualityReport(providerName: string): QualityReport | null {
    return getQualityReport(
      providerName,
      this.providerConfigs,
      this.slaTracker,
      this.gapDetector,
      this.failoverManagers
    );
  }

  getAllReports(): QualityReport[] {
    return getAllReports(
      this.providerConfigs,
      this.slaTracker,
      this.gapDetector,
      this.failoverManagers
    );
  }

  meetsQualityThreshold(providerName: string): boolean {
    return meetsQualityThreshold(
      providerName,
      this.providerConfigs,
      this.slaTracker,
      this.gapDetector,
      this.failoverManagers
    );
  }

  shutdown(): void {
    for (const manager of this.failoverManagers.values()) {
      manager.stop();
    }
    this.failoverManagers.clear();
    logger.info('QualityMonitoringIntegration: Shutdown complete');
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

export async function initializeQualityMonitoring(
  config?: Record<string, ProviderQualityConfig>
): Promise<QualityMonitoringIntegration> {
  qualityIntegrationInstance = new QualityMonitoringIntegration();
  if (config) {
    await qualityIntegrationInstance.initializeAll(config);
  }
  return qualityIntegrationInstance;
}

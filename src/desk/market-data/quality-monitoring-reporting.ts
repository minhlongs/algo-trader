// SPDX-License-Identifier: MIT
/**
 * Quality Monitoring Reporting
 * Computes reports and checks quality thresholds
 */

import { MarketDataSource, QualityReport, ProviderQualityConfig } from './types';
import { GapDetector } from './gap-detector';
import { SlaTracker } from './sla-tracker';
import { FailoverManager } from './provider-failover';
import { getFailoverKey, parseProvider } from './quality-monitoring-failover-init';

export function getQualityReport(
  providerName: string,
  providerConfigs: Map<MarketDataSource, ProviderQualityConfig>,
  slaTracker: SlaTracker,
  gapDetector: GapDetector,
  failoverManagers: Map<string, FailoverManager>
): QualityReport | null {
  const provider = parseProvider(providerName);
  if (!provider) return null;

  const config = providerConfigs.get(provider);
  if (!config) return null;

  // Get SLA report
  const slaReport = slaTracker.getSlaReport(provider);

  // Get gap statistics for all tracked symbols/timeframes
  const allGapStats = gapDetector.getAllStats();
  const providerGapStats = allGapStats.filter(
    (stats) => stats.provider === (provider as string)
  );

  // Count outliers (placeholder - would query outlier detector)
  const outlierCount = 0;

  // Get active status from failover manager if exists
  const failoverKey = getFailoverKey(failoverManagers, provider);
  let isActive = true;
  if (failoverKey) {
    const manager = failoverManagers.get(failoverKey);
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

export function getAllReports(
  providerConfigs: Map<MarketDataSource, ProviderQualityConfig>,
  slaTracker: SlaTracker,
  gapDetector: GapDetector,
  failoverManagers: Map<string, FailoverManager>
): QualityReport[] {
  const reports: QualityReport[] = [];

  for (const [provider] of providerConfigs) {
    const report = getQualityReport(
      provider as string,
      providerConfigs,
      slaTracker,
      gapDetector,
      failoverManagers
    );
    if (report) {
      reports.push(report);
    }
  }

  return reports;
}

export function meetsQualityThreshold(
  providerName: string,
  providerConfigs: Map<MarketDataSource, ProviderQualityConfig>,
  slaTracker: SlaTracker,
  gapDetector: GapDetector,
  failoverManagers: Map<string, FailoverManager>
): boolean {
  const report = getQualityReport(
    providerName,
    providerConfigs,
    slaTracker,
    gapDetector,
    failoverManagers
  );
  if (!report) return false;

  const config = providerConfigs.get(report.provider);
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

// SPDX-License-Identifier: MIT
/**
 * Quality Monitoring Failover Initialization and Helpers
 */

import { logger } from '../../shared/utils/logger';
import { MarketDataSource, ProviderQualityConfig, Candle } from './types';
import { FailoverManager } from './provider-failover';
import type { SlaTracker } from './sla-tracker';
import type { GapDetector } from './gap-detector';
import type { OutlierDetector } from './outlier-detection';

export function parseProvider(providerName: string): MarketDataSource | null {
  try {
    const values = Object.values(MarketDataSource) as readonly string[];
    if (values.includes(providerName)) return providerName as unknown as MarketDataSource;
    const direct = MarketDataSource[providerName.toUpperCase() as keyof typeof MarketDataSource];
    return direct ?? null;
  } catch {
    return null;
  }
}

export function getFailoverKey(
  failoverManagers: Map<string, FailoverManager>,
  provider: MarketDataSource
): string | null {
  for (const [key, manager] of failoverManagers) {
    const active = manager.getActiveProvider();
    if (active === provider) {
      return key;
    }
  }
  return null;
}

export function setupFailover(
  failoverManagers: Map<string, FailoverManager>,
  config: ProviderQualityConfig
): void {
  if (!config.failoverTarget) return;

  const key = getFailoverKey(failoverManagers, config.provider);
  if (!key) return;

  // Don't create duplicate failover managers
  if (failoverManagers.has(key)) {
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
  failoverManagers.set(key, manager);

  logger.info('QualityMonitoringIntegration: Failover setup', {
    primary: config.provider,
    secondary: config.failoverTarget,
  });
}

export function getActiveProvider(
  failoverManagers: Map<string, FailoverManager>,
  providerConfigs: Map<MarketDataSource, ProviderQualityConfig>,
  _dataType: string
): MarketDataSource | null {
  for (const [, manager] of failoverManagers) {
    return manager.getActiveProvider();
  }

  const firstConfig = providerConfigs.values().next().value;
  return firstConfig?.provider ?? null;
}

export function recordProviderRequestResult(
  providerName: string,
  success: boolean,
  latencyMs: number,
  slaTracker: SlaTracker,
  failoverManagers: Map<string, FailoverManager>,
  failureContext?: { symbol: string; operation: string; error?: Error }
): void {
  const provider = parseProvider(providerName);
  if (!provider) return;

  slaTracker.recordRequest(provider, success, latencyMs);

  const failoverKey = getFailoverKey(failoverManagers, provider);
  if (failoverKey) {
    const manager = failoverManagers.get(failoverKey);
    manager?.recordRequestResult(success, latencyMs);
  }

  if (!success && failureContext) {
    logger.warn('QualityMonitoring: Request failed', {
      provider,
      symbol: failureContext.symbol,
      operation: failureContext.operation,
      error: failureContext.error?.message,
    });
  }
}

export function recordProviderCandle(
  providerName: string,
  symbol: string,
  timeframe: string,
  candle: Candle,
  gapDetector: GapDetector,
  outlierDetector: OutlierDetector,
  slaTracker: SlaTracker
): void {
  const provider = parseProvider(providerName);
  if (!provider) return;

  gapDetector.recordCandle(provider as string, symbol, timeframe, candle);
  outlierDetector.addCandle(candle, provider);
  slaTracker.recordCandleCompleteness(provider, symbol, timeframe, 1, 1);
}

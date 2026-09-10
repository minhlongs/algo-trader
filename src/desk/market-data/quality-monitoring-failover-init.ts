// SPDX-License-Identifier: MIT
/**
 * Quality Monitoring Failover Initialization and Helpers
 */

import { logger } from '../../shared/utils/logger';
import { MarketDataSource, ProviderQualityConfig } from './types';
import { FailoverManager } from './provider-failover';

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

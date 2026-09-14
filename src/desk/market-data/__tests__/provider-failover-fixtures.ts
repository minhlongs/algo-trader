// SPDX-License-Identifier: MIT
/**
 * Test fixtures and factory helpers for provider failover tests.
 */

import {
  FailoverManager,
  ProviderFailoverConfig,
  MarketDataSource,
} from '../provider-failover';

export function createTestFailoverManager(
  overrides?: Partial<ProviderFailoverConfig>,
): FailoverManager {
  return new FailoverManager({
    primary: MarketDataSource.SANTIMENT,
    secondary: MarketDataSource.LUNARCRUSH,
    failureThreshold: 3,
    failbackCooldownMs: 5 * 60 * 1000,
    recoveryTimeMs: 60 * 1000,
    enableAutoFailback: true,
    healthCheckIntervalMs: 1000,
    ...overrides,
  });
}

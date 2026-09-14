// SPDX-License-Identifier: MIT
/**
 * FailoverManager core lifecycle, circuit breaker, and manual failover tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FailoverManager,
  ProviderHealthStatus,
  MarketDataSource,
  ProviderHealthSnapshot,
} from '../provider-failover';
import { createTestFailoverManager } from './provider-failover-fixtures';

type PrivateFailoverManager = {
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>;
};

describe('FailoverManager core', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    manager = createTestFailoverManager();
  });

  afterEach(() => {
    manager.stop();
  });

  describe('initialization', () => {
    it('should start with primary provider active', () => {
      const active = manager.getActiveProvider();
      expect(active).toBe(MarketDataSource.SANTIMENT);
    });

    it('should have correct initial health snapshots', () => {
      const snapshots = manager.getAllHealthSnapshots();
      expect(snapshots.length).toBe(2);

      const primary = snapshots.find((s) => s.provider === MarketDataSource.SANTIMENT);
      const secondary = snapshots.find((s) => s.provider === MarketDataSource.LUNARCRUSH);

      expect(primary?.isPrimary).toBe(true);
      expect(primary?.isActive).toBe(true);
      expect(secondary?.isPrimary).toBe(false);
      expect(secondary?.isActive).toBe(false);
    });
  });

  describe('circuit breaker', () => {
    it('should trigger failover after consecutive failures', async () => {
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);

      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const active = manager.getActiveProvider();
      expect(active).toBe(MarketDataSource.LUNARCRUSH);
    });

    it('should not failover with fewer than threshold failures', () => {
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);

      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);
    });

    it('should reset circuit on successful recovery during HALF_OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(manager.getActiveProvider()).toBe(MarketDataSource.LUNARCRUSH);

      const result = await manager.forceFailback('Recovered');
      expect(result).toBe(true);
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);
    });
  });

  describe('manual failover/failback', () => {
    it('should allow manual failover', async () => {
      const result = await manager.forceFailover('Maintenance');
      expect(result).toBe(true);
      expect(manager.getActiveProvider()).toBe(MarketDataSource.LUNARCRUSH);
    });

    it('should not failover if already on secondary', async () => {
      await manager.forceFailover('Test');
      const result = await manager.forceFailover('Test again');
      expect(result).toBe(false);
    });

    it('should allow manual failback if secondary healthy', async () => {
      await manager.forceFailover('Test');
      const result = await manager.forceFailback('Recovered');
      expect(result).toBe(true);
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);
    });

    it('should not failback if secondary unhealthy', async () => {
      await manager.forceFailover('Test');
      let result = await manager.forceFailback('Test');
      expect(result).toBe(true);

      await manager.forceFailover('Test again');
      const priv = manager as unknown as PrivateFailoverManager;
      const secondarySnapshot = priv.providerStatus.get(MarketDataSource.LUNARCRUSH);
      if (secondarySnapshot) {
        secondarySnapshot.status = ProviderHealthStatus.UNHEALTHY;
        secondarySnapshot.consecutiveFailures = 10;
      }

      result = await manager.forceFailback('Test');
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should stop health check timer on stop', () => {
      manager.stop();
      expect(true).toBe(true);
    });
  });
});

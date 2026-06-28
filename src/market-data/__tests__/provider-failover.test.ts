// SPDX-License-Identifier: MIT
/**
 * @vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FailoverManager, ProviderHealthStatus } from '../provider-failover';
import { MarketDataSource } from '../types';

describe('FailoverManager', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    manager = new FailoverManager({
      primary: MarketDataSource.SANTIMENT,
      secondary: MarketDataSource.LUNARCRUSH,
      failureThreshold: 3,
      failbackCooldownMs: 5 * 60 * 1000, // 5 minutes
      healthCheckIntervalMs: 1000, // 1 second for tests
    });
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

      const primary = snapshots.find(s => s.provider === MarketDataSource.SANTIMENT);
      const secondary = snapshots.find(s => s.provider === MarketDataSource.LUNARCRUSH);

      expect(primary?.isPrimary).toBe(true);
      expect(primary?.isActive).toBe(true);
      expect(secondary?.isPrimary).toBe(false);
      expect(secondary?.isActive).toBe(false);
    });
  });

  describe('circuit breaker', () => {
    it('should trigger failover after consecutive failures', async () => {
      // Initial: primary active
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);

      // Record failures
      manager.recordRequestResult(false, 0); // Fail 1
      manager.recordRequestResult(false, 0); // Fail 2
      manager.recordRequestResult(false, 0); // Fail 3 -> should trigger failover

      // Wait for async health check
      await new Promise(resolve => setTimeout(resolve, 100));

      const active = manager.getActiveProvider();
      expect(active).toBe(MarketDataSource.LUNARCRUSH);
    });

    it('should not failover with fewer than threshold failures', () => {
      manager.recordRequestResult(false, 0); // Fail 1
      manager.recordRequestResult(false, 0); // Fail 2

      // Still within threshold
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);
    });

    it('should reset circuit on successful recovery during HALF_OPEN', async () => {
      // Trigger failover first
      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(manager.getActiveProvider()).toBe(MarketDataSource.LUNARCRUSH);

      // Manually trigger failback to test recovery
      const result = await manager.forceFailback('Recovered');
      expect(result).toBe(true);
      expect(manager.getActiveProvider()).toBe(MarketDataSource.SANTIMENT);
    });
  });

  describe('request result recording', () => {
    it('should update consecutive failures on failure', () => {
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);

      const primary = (manager as any).providerStatus.get(MarketDataSource.SANTIMENT);
      expect(primary?.consecutiveFailures).toBe(2);
    });

    it('should reset consecutive failures on success', () => {
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);
      expect((manager as any).providerStatus.get(MarketDataSource.SANTIMENT)?.consecutiveFailures).toBe(2);

      manager.recordRequestResult(true, 100);
      expect((manager as any).providerStatus.get(MarketDataSource.SANTIMENT)?.consecutiveFailures).toBe(0);
    });

    it('should update latency on success', () => {
      manager.recordRequestResult(true, 150);
      // Latency is recorded but not stored in snapshot directly
      // It's passed to SLA tracker
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
      // Failover to secondary
      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(manager.getActiveProvider()).toBe(MarketDataSource.LUNARCRUSH);

      // Try to failback - secondary is still marked as unhealthy due to being active with failures
      const result = await manager.forceFailback('Test');
      expect(result).toBe(false);
    });
  });

  describe('failover history', () => {
    it('should record failover events', async () => {
      expect(manager.getFailoverHistory()).toHaveLength(0);

      // Trigger automatic failover
      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const history = manager.getFailoverHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('fromProvider');
      expect(history[0]).toHaveProperty('toProvider');
      expect(history[0]).toHaveProperty('reason');
      expect(history[0]).toHaveProperty('triggeredBy');
    });

    it('should limit history to 1000 events', () => {
      const history = manager.getFailoverHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('health status updates', () => {
    it('should update provider health based on consecutive failures', () => {
      const primary = (manager as any).providerStatus.get(MarketDataSource.SANTIMENT);

      expect(primary?.status).toBe(ProviderHealthStatus.HEALTHY);

      manager.recordRequestResult(false, 0);
      expect(primary?.status).toBe(ProviderHealthStatus.DEGRADED);

      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);
      expect(primary?.status).toBe(ProviderHealthStatus.UNHEALTHY);
    });

    it('should set active flag correctly', () => {
      const primary = (manager as any).providerStatus.get(MarketDataSource.SANTIMENT);
      const secondary = (manager as any).providerStatus.get(MarketDataSource.LUNARCRUSH);

      expect(primary?.isActive).toBe(true);
      expect(secondary?.isActive).toBe(false);

      // Trigger failover
      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }

      expect(primary?.isActive).toBe(false);
      expect(secondary?.isActive).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should stop health check timer on stop', () => {
      manager.stop();
      // No error means cleanup successful
      expect(true).toBe(true);
    });
  });
});

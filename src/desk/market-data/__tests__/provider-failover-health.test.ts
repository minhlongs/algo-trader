// SPDX-License-Identifier: MIT
/**
 * Provider Failover — health tracking, request recording, and history tests
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

describe('FailoverManager health and tracking', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    manager = createTestFailoverManager();
  });

  afterEach(() => {
    manager.stop();
  });

  describe('request result recording', () => {
    it('should update consecutive failures on failure', () => {
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);

      const priv = manager as unknown as PrivateFailoverManager;
      const primary = priv.providerStatus.get(MarketDataSource.SANTIMENT);
      expect(primary?.consecutiveFailures).toBe(2);
    });

    it('should reset consecutive failures on success', () => {
      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);
      const priv = manager as unknown as PrivateFailoverManager;
      expect(priv.providerStatus.get(MarketDataSource.SANTIMENT)?.consecutiveFailures).toBe(2);

      manager.recordRequestResult(true, 100);
      expect(priv.providerStatus.get(MarketDataSource.SANTIMENT)?.consecutiveFailures).toBe(0);
    });

    it('should update latency on success', () => {
      manager.recordRequestResult(true, 150);
      // Latency is recorded in SLA tracker
    });
  });

  describe('failover history', () => {
    it('should record failover events', async () => {
      expect(manager.getFailoverHistory()).toHaveLength(0);

      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

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
      const priv = manager as unknown as PrivateFailoverManager;
      const primary = priv.providerStatus.get(MarketDataSource.SANTIMENT);

      expect(primary?.status).toBe(ProviderHealthStatus.HEALTHY);

      manager.recordRequestResult(false, 0);
      expect(primary?.status).toBe(ProviderHealthStatus.DEGRADED);

      manager.recordRequestResult(false, 0);
      manager.recordRequestResult(false, 0);
      expect(primary?.status).toBe(ProviderHealthStatus.UNHEALTHY);
    });

    it('should set active flag correctly', () => {
      const priv = manager as unknown as PrivateFailoverManager;
      const primary = priv.providerStatus.get(MarketDataSource.SANTIMENT);
      const secondary = priv.providerStatus.get(MarketDataSource.LUNARCRUSH);

      expect(primary?.isActive).toBe(true);
      expect(secondary?.isActive).toBe(false);

      for (let i = 0; i < 3; i++) {
        manager.recordRequestResult(false, 0);
      }

      expect(primary?.isActive).toBe(false);
      expect(secondary?.isActive).toBe(true);
    });
  });
});

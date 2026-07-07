import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConnectionPoolManager,
  PoolConfig,
  getConnectionPoolManager,
} from '../../../src/platform/workers/connection-pool';

// Mock transport with a fetch-like interface
const createMockTransport = () => ({
  fetch: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
});

describe('ConnectionPoolManager', () => {
  let config: PoolConfig[];
  let poolManager: ConnectionPoolManager;

  beforeEach(() => {
    config = [
      { service: 'polymarket', maxConnections: 20, maxIdle: 10, ttl: 30 },
      { service: 'llm', maxConnections: 10, maxIdle: 5, ttl: 60 },
      { service: 'exchange', maxConnections: 15, maxIdle: 8, ttl: 30 },
    ];
    poolManager = new ConnectionPoolManager(config);
  });

  describe('constructor', () => {
    it('should initialize with empty pool map', () => {
      expect(poolManager).toBeInstanceOf(ConnectionPoolManager);
    });
  });

  describe('initPool', () => {
    it('should register a pool for a service', () => {
      const transport = createMockTransport();
      poolManager.initPool('polymarket', transport);
      expect(poolManager.hasPool('polymarket')).toBe(true);
    });
  });

  describe('hasPool', () => {
    it('should return false for unregistered service', () => {
      expect(poolManager.hasPool('unknown')).toBe(false);
    });
  });

  describe('fetchWithPool', () => {
    it('should execute fetch through the pool', async () => {
      const transport = createMockTransport();
      poolManager.initPool('polymarket', transport);
      const response = await poolManager.fetchWithPool(
        'polymarket',
        'https://api.example.com/data',
        { method: 'GET' },
      );
      expect(transport.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should throw for unconfigured service', async () => {
      await expect(
        poolManager.fetchWithPool('unknown', 'https://api.example.com'),
      ).rejects.toThrow('No pool configured for service: unknown');
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for all configured services', () => {
      const metrics = poolManager.getMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics[0].service).toBe('polymarket');
    });
  });

  describe('getConnectionPoolManager (singleton)', () => {
    it('should return singleton instance', () => {
      const instance1 = getConnectionPoolManager();
      const instance2 = getConnectionPoolManager();
      expect(instance1).toBe(instance2);
    });

    it('should initialize with default config', () => {
      const instance = getConnectionPoolManager();
      expect(instance).toBeInstanceOf(ConnectionPoolManager);
    });
  });
});

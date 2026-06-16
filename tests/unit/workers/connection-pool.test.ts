import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConnectionPoolManager,
  PoolConfig,
  getConnectionPoolManager,
} from '../../../src/workers/connection-pool';

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
    it('should initialize with empty pools', () => {
      expect(poolManager).toBeInstanceOf(ConnectionPoolManager);
    });
  });

  describe('initPool', () => {
    it('should initialize pool for service', () => {
      const mockHyperdrive = { fetch: vi.fn() };
      poolManager.initPool('polymarket', mockHyperdrive);
      expect(poolManager.hasPool('polymarket')).toBe(true);
    });

    it('should allow multiple pools', () => {
      poolManager.initPool('polymarket', { fetch: vi.fn() });
      poolManager.initPool('llm', { fetch: vi.fn() });
      poolManager.initPool('exchange', { fetch: vi.fn() });

      expect(poolManager.hasPool('polymarket')).toBe(true);
      expect(poolManager.hasPool('llm')).toBe(true);
      expect(poolManager.hasPool('exchange')).toBe(true);
    });
  });

  describe('fetchWithPool', () => {
    let mockHyperdrive: { fetch: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockHyperdrive = { fetch: vi.fn() };
      poolManager.initPool('polymarket', mockHyperdrive);
    });

    it('should execute fetch with pool', async () => {
      const mockResponse = new Response(JSON.stringify({ result: 'success' }), {
        status: 200,
      });
      mockHyperdrive.fetch.mockResolvedValue(mockResponse);

      const result = await poolManager.fetchWithPool(
        'polymarket',
        'https://api.example.com/test'
      );

      expect(result).toBe(mockResponse);
      expect(mockHyperdrive.fetch).toHaveBeenCalledWith(
        expect.any(Request)
      );
    });

    it('should pass through options in Request', async () => {
      const mockResponse = new Response(JSON.stringify({ result: 'success' }), {
        status: 200,
      });
      mockHyperdrive.fetch.mockResolvedValue(mockResponse);

      await poolManager.fetchWithPool('polymarket', 'https://api.example.com/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });

      const request = mockHyperdrive.fetch.mock.calls[0][0] as Request;
      expect(request.method).toBe('POST');
      expect(request.headers.get('Content-Type')).toBe('application/json');
    });

    it('should throw error for uninitialized pool', async () => {
      const freshManager = new ConnectionPoolManager(config);
      await expect(
        freshManager.fetchWithPool('polymarket', 'https://api.example.com/test')
      ).rejects.toThrow('No pool configured for service: polymarket. Call initPool() first.');
    });

    it('should handle fetch errors', async () => {
      mockHyperdrive.fetch.mockRejectedValue(new Error('Network error'));

      await expect(
        poolManager.fetchWithPool('polymarket', 'https://api.example.com/test')
      ).rejects.toThrow('Network error');
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for all initialized pools', () => {
      poolManager.initPool('polymarket', { fetch: vi.fn() });
      poolManager.initPool('llm', { fetch: vi.fn() });

      const metrics = poolManager.getMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics[0]).toMatchObject({
        service: 'polymarket',
        activeConnections: 20,
        idleConnections: 10,
        waitQueueLength: 0,
      });
      expect(metrics[1]).toMatchObject({
        service: 'llm',
        activeConnections: 10,
        idleConnections: 5,
        waitQueueLength: 0,
      });
    });

    it('should return empty array when no pools initialized', () => {
      const metrics = poolManager.getMetrics();
      expect(metrics).toEqual([]);
    });

    it('should include all configured services when initialized', () => {
      config.forEach(c => {
        poolManager.initPool(c.service, { fetch: vi.fn() });
      });

      const metrics = poolManager.getMetrics();
      expect(metrics).toHaveLength(3);
    });
  });

  describe('hasPool', () => {
    it('should return false for uninitialized service', () => {
      expect(poolManager.hasPool('polymarket')).toBe(false);
    });

    it('should return true for initialized service', () => {
      poolManager.initPool('polymarket', { fetch: vi.fn() });
      expect(poolManager.hasPool('polymarket')).toBe(true);
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

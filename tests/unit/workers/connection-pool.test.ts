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

  describe('fetchWithPool idle-decrement path', () => {
    it('decrements idle and increments active when idle > 0', async () => {
      const cfg: PoolConfig[] = [{ service: 'qservice', maxConnections: 5, maxIdle: 3, ttl: 30 }];
      const pm = new ConnectionPoolManager(cfg);
      pm.initQueue('qservice', {
        add: vi.fn().mockResolvedValue({ finished: () => Promise.resolve('ok') }),
      });
      // initQueue seeds idle = 1
      const res = await pm.fetchWithPool('qservice', 'https://api.example.com', { method: 'GET' });
      expect(res.status).toBe(200);
      const metrics = pm.getMetrics().find((m) => m.service === 'qservice');
      // after fetch: active back to 0, idle restored to 1
      expect(metrics?.activeConnections).toBe(0);
      expect(metrics?.idleConnections).toBe(1);
    });
  });

  describe('fetchWithPool legacy finished branch', () => {
    it('returns the legacy queue result shape when response has finished()', async () => {
      const legacyResponse = { finished: () => Promise.resolve({ data: 'payload' }) };
      const transport = { fetch: vi.fn().mockResolvedValue(legacyResponse) };
      poolManager.initPool('legacy', transport as any);
      const res = await poolManager.fetchWithPool('legacy', 'https://api.example.com');
      expect(res).toBe(legacyResponse);
    });
  });

  describe('initQueue', () => {
    it('registers a queue for a new service when none exists', () => {
      poolManager.initQueue('newservice', {
        add: vi.fn().mockResolvedValue({ finished: () => Promise.resolve('ok') }),
      });
      expect(poolManager.hasQueue('newservice')).toBe(true);
      expect(poolManager.hasPool('newservice')).toBe(true);
    });

    it('attaches queue to an existing transport entry', () => {
      const cfg: PoolConfig[] = [{ service: 'dualservice', maxConnections: 5, maxIdle: 3, ttl: 30 }];
      const pm = new ConnectionPoolManager(cfg);
      const transport = createMockTransport();
      pm.initPool('dualservice', transport);
      pm.initQueue('dualservice', {
        add: vi.fn().mockResolvedValue({ finished: () => Promise.resolve('ok') }),
      });
      expect(pm.hasQueue('dualservice')).toBe(true);
      // pool should not be re-seeded (still has the original idle=0 entry)
      const metrics = pm.getMetrics().find((m) => m.service === 'dualservice');
      expect(metrics?.idleConnections).toBe(0);
    });
  });

  describe('hasQueue', () => {
    it('returns false when no queue registered', () => {
      expect(poolManager.hasQueue('nobody')).toBe(false);
    });

    it('returns false when transport entry has no _legacyQueue', () => {
      const transport = createMockTransport();
      poolManager.initPool('plain', transport);
      expect(poolManager.hasQueue('plain')).toBe(false);
    });
  });

  describe('enqueueRequest', () => {
    it('enqueues via the registered queue and returns finished()', async () => {
      const add = vi.fn().mockResolvedValue({ finished: () => Promise.resolve({ data: 'queued-result' }) });
      poolManager.initQueue('enq', { add } as any);
      const handle = await poolManager.enqueueRequest('enq', 'https://api.example.com', { method: 'POST' });
      expect(add).toHaveBeenCalledWith('https://api.example.com', { method: 'POST' });
      const out = await handle.finished();
      expect(out.data).toBe('queued-result');
    });

    it('coerces non-object finished() result to "ok"', async () => {
      const add = vi.fn().mockResolvedValue({ finished: () => Promise.resolve('plain-string') });
      poolManager.initQueue('scalar', { add } as any);
      const handle = await poolManager.enqueueRequest('scalar', 'https://api.example.com');
      const out = await handle.finished();
      expect(out.data).toBe('ok');
    });

    it('throws when no queue registered', async () => {
      await expect(
        poolManager.enqueueRequest('missing', 'https://api.example.com'),
      ).rejects.toThrow('No queue configured for service: missing');
    });
  });
});

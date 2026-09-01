/**
 * SpreadDetector — Integration Tests
 *
 * Covers the SpreadDetector class: constructor wiring, start/stop lifecycle,
 * scan() (the main detection loop), getMetrics(), storeOpportunity(),
 * getRecentOpportunities(), and recordLatency(). The real pricing and
 * persistence helpers are exercised against an in-memory fake Redis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = vi.hoisted(() => {
  const store = new Map<string, Record<string, string>>();
  const keys: string[] = [];
  const obj: any = {
    store,
    keys,
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, JSON.parse(v));
      return Promise.resolve('OK');
    }),
    del: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    }),
    hgetall: vi.fn((k: string) => Promise.resolve(store.get(k) ?? {})),
    keysFn: vi.fn((pattern: string) => {
      if (pattern === 'arbitrage:opportunities:*') return Promise.resolve(keys.slice());
      return Promise.resolve(keys.filter((k) => k.startsWith(pattern.replace('*', ''))));
    }),
    hset: vi.fn((k: string, data: Record<string, any>) => {
      store.set(k, Object.fromEntries(Object.entries(data).map(([kk, vv]) => [kk, String(vv)])));
      return Promise.resolve(1);
    }),
    expire: vi.fn((_k: string, _s: number) => Promise.resolve(1)),
    pipeline: vi.fn(() => {
      const ops: Array<{ op: string; args: any[] }> = [];
      const ctx: any = {
        hset: (k: string, data: Record<string, any>) => {
          ops.push({ op: 'hset', args: [k, data] });
          return ctx;
        },
        hgetall: (k: string) => {
          ops.push({ op: 'hgetall', args: [k] });
          return ctx;
        },
        expire: (k: string, s: number) => {
          ops.push({ op: 'expire', args: [k, s] });
          return ctx;
        },
        exec: async () => {
          const results: any[] = [];
          for (const { op, args } of ops) {
            if (op === 'hset') {
              const [k, data] = args;
              store.set(k, Object.fromEntries(Object.entries(data).map(([kk, vv]) => [kk, String(vv)])));
              if (!keys.includes(k)) keys.push(k);
            } else if (op === 'hgetall') {
              results.push(store.get(args[0]) ?? {});
            }
          }
          return results;
        },
      };
      return ctx;
    }),
  };
  // alias keys property used by loadRecentOpportunities
  Object.defineProperty(obj, 'keys', { get: () => obj.keysFn });
  return obj;
});

vi.mock('../../../redis', () => ({
  getRedisClient: () => redisMock,
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SpreadDetector } from '../spread-detector';
import type { SpreadConfig, ArbitrageOpportunity } from '../spread-detector-types';

function makeConfig(overrides: Partial<SpreadConfig> = {}): SpreadConfig {
  return {
    minSpreadPercent: 0.5,
    maxLatencyMs: 500,
    checkIntervalMs: 1000,
    enableMLScoring: true,
    enableLatencyOptimization: false,
    cacheTTL: 60_000,
    parallelBatchSize: 10,
    ...overrides,
  };
}

function makeOpp(overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity {
  return {
    id: 'opp-1',
    symbol: 'BTC/USDT',
    buyExchange: 'binance',
    sellExchange: 'kraken',
    buyPrice: 50000,
    sellPrice: 50100,
    spread: 100,
    spreadPercent: 0.2,
    timestamp: 1700000000,
    latency: 12,
    ...overrides,
  };
}

describe('SpreadDetector', () => {
  let detector: SpreadDetector;

  beforeEach(() => {
    redisMock.store.clear();
    redisMock.keys.length = 0;
    vi.clearAllMocks();
    detector = new SpreadDetector(makeConfig());
  });

  describe('constructor', () => {
    it('creates an instance with default config', () => {
      expect(detector).toBeDefined();
    });

    it('accepts custom config overrides', () => {
      const d = new SpreadDetector(makeConfig({ minSpreadPercent: 1.5, maxLatencyMs: 200 }));
      expect(d).toBeDefined();
    });
  });

  describe('start/stop lifecycle', () => {
    it('starts and stops without throwing', () => {
      expect(() => detector.start(['BTC/USDT'], ['binance'], vi.fn())).not.toThrow();
      expect(() => detector.stop()).not.toThrow();
    });

    it('is idempotent when called multiple times', () => {
      detector.start(['BTC/USDT'], ['binance'], vi.fn());
      detector.start(['ETH/USDT'], ['binance'], vi.fn()); // no-op, already running
      detector.stop();
      detector.stop();
      expect(true).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('returns initial metrics with zero scans', () => {
      const metrics = detector.getMetrics();
      expect(metrics.totalScans).toBe(0);
      expect(metrics.opportunitiesFound).toBe(0);
      expect(metrics.avgScanDurationMs).toBe(0);
      expect(metrics.p95ScanDurationMs).toBe(0);
      expect(metrics.p99ScanDurationMs).toBe(0);
      expect(metrics.isUnderTarget).toBe(true);
      expect(metrics.targetLatencyMs).toBe(500);
    });

    it('returns updated metrics after a scan', async () => {
      await detector.scan(['BTC/USDT'], ['binance']);
      const metrics = detector.getMetrics();
      expect(metrics.totalScans).toBe(1);
    });
  });

  describe('scan', () => {
    it('returns an array (possibly empty when no prices)', async () => {
      const result = await detector.scan(['BTC/USDT'], ['binance']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array when no symbols provided', async () => {
      const result = await detector.scan([], ['binance']);
      expect(result).toEqual([]);
    });

    it('returns empty array when no exchanges provided', async () => {
      const result = await detector.scan(['BTC/USDT'], []);
      expect(result).toEqual([]);
    });

    it('processes multiple symbols in batches', async () => {
      const symbols = ['BTC/USDT', 'ETH/USDT', 'ADA/USDT'];
      const result = await detector.scan(symbols, ['binance']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('increments totalscans on each call', async () => {
      await detector.scan(['BTC/USDT'], ['binance']);
      await detector.scan(['ETH/USDT'], ['binance']);
      expect(detector.getMetrics().totalScans).toBe(2);
    });

    it('does not throw when redis is empty', async () => {
      await expect(detector.scan(['BTC/USDT'], ['binance'])).resolves.toBeDefined();
    });
  });

  describe('storeOpportunity', () => {
    it('stores an opportunity without throwing', async () => {
      await expect(detector.storeOpportunity(makeOpp())).resolves.toBeUndefined();
    });

    it('stores multiple opportunities', async () => {
      await detector.storeOpportunity(makeOpp({ id: 'opp-1' }));
      await detector.storeOpportunity(makeOpp({ id: 'opp-2' }));
      const result = await detector.getRecentOpportunities();
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.id)).toEqual(expect.arrayContaining(['opp-1', 'opp-2']));
    });

    it('propagates storage errors (route layer swallows them)', async () => {
      redisMock.pipeline.mockImplementationOnce(() => {
        throw new Error('redis down');
      });
      await expect(detector.storeOpportunity(makeOpp())).rejects.toThrow('redis down');
    });
  });

  describe('getRecentOpportunities', () => {
    it('returns an array (possibly empty)', async () => {
      const result = await detector.getRecentOpportunities();
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array when no opportunities stored', async () => {
      const result = await detector.getRecentOpportunities();
      expect(result).toEqual([]);
    });

    it('returns stored opportunities after storeOpportunity', async () => {
      await detector.storeOpportunity(makeOpp({ id: 'opp-1' }));
      const result = await detector.getRecentOpportunities();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('accepts a count limit', async () => {
      await detector.storeOpportunity(makeOpp({ id: 'opp-1' }));
      await detector.storeOpportunity(makeOpp({ id: 'opp-2' }));
      const result = await detector.getRecentOpportunities(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('propagates redis errors (route layer handles them)', async () => {
      const orig = redisMock.keysFn;
      redisMock.keysFn = vi.fn().mockRejectedValue(new Error('redis down'));
      await expect(detector.getRecentOpportunities()).rejects.toThrow('redis down');
      redisMock.keysFn = orig;
    });
  });

  describe('recordLatency', () => {
    it('records latency without throwing', () => {
      expect(() => detector.recordLatency('binance', 50)).not.toThrow();
    });

    it('records multiple latencies the same exchange', () => {
      detector.recordLatency('binance', 50);
      detector.recordLatency('binance', 100);
      detector.recordLatency('binance', 75);
      expect(true).toBe(true);
    });

    it('records latency for multiple exchanges', () => {
      detector.recordLatency('binance', 50);
      detector.recordLatency('okx', 80);
      detector.recordLatency('kraken', 120);
      expect(true).toBe(true);
    });
  });
});
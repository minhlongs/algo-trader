/**
 * Tests for ticker-cache — TickerCache Redis hash wrapper.
 *
 * getRedisClient is mocked so no Redis is needed. The pipeline (hset +
 * expire) and hgetall paths are exercised with a hand-rolled client stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetRedisClient } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
}));

vi.mock('../index', () => ({ getRedisClient: mockGetRedisClient }));

import { TickerCache } from '../ticker-cache';

function makeClient() {
  const store = new Map<string, Record<string, string>>();
  return {
    store,
    pipeline: () => {
      const ops: Array<() => Promise<void>> = [];
      const pipe = {
        hset: (k: string, v: Record<string, string>) => { ops.push(async () => store.set(k, v)); return pipe; },
        expire: (k: string, ttl: number) => { ops.push(async () => { if (store.has(k)) store.get(k)!.__ttl = ttl; }); return pipe; },
        exec: async () => { for (const op of ops) await op(); },
      };
      return pipe;
    },
    hgetall: async (k: string) => store.get(k) ?? {},
  };
}

function makeTicker(overrides: Partial<{ last: number; bid: number; ask: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> = {}) {
  return {
    last: 100, bid: 99, ask: 101, high24h: 110, low24h: 90, volume24h: 1000, timestamp: 1700000000000,
    ...overrides,
  };
}

describe('TickerCache', () => {
  let client: ReturnType<typeof makeClient>;
  let cache: TickerCache;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    mockGetRedisClient.mockReturnValue(client as never);
    cache = new TickerCache();
  });

  it('builds the redis key from exchange + symbol', async () => {
    await cache.setTicker('binance', 'BTCUSDT', makeTicker());
    expect(client.store.has('ticker:binance:BTCUSDT')).toBe(true);
  });

  it('stores every ticker field as a string via pipeline', async () => {
    await cache.setTicker('binance', 'ETHUSDT', makeTicker({ last: 200, bid: 199, ask: 201 }));

    const stored = client.store.get('ticker:binance:ETHUSDT');
    expect(stored).toMatchObject({
      last: '200', bid: '199', ask: '201', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000',
    });
  });

  it('attaches a 1-hour TTL via pipeline.expire', async () => {
    await cache.setTicker('binance', 'BTCUSDT', makeTicker());
    expect(client.store.get('ticker:binance:BTCUSDT')!.__ttl).toBe(3600);
  });

  it('round-trips a ticker through set then get', async () => {
    await cache.setTicker('binance', 'BTCUSDT', makeTicker({ last: 123.456 }));

    const res = await cache.getTicker('binance', 'BTCUSDT');

    expect(res).not.toBeNull();
    expect(res!.last).toBe(123.456);
    expect(res!.bid).toBe(99);
    expect(res!.ask).toBe(101);
    expect(res!.timestamp).toBe(1700000000000);
  });

  it('returns null when the key is absent', async () => {
    const res = await cache.getTicker('binance', 'MISSING');
    expect(res).toBeNull();
  });

  it('returns null when the hash is empty', async () => {
    client.store.set('ticker:binance:EMPTY', {});
    const res = await cache.getTicker('binance', 'EMPTY');
    expect(res).toBeNull();
  });

  it('coerces missing fields to zero', async () => {
    client.store.set('ticker:binance:PARTIAL', { last: '50' });
    const res = await cache.getTicker('binance', 'PARTIAL');
    expect(res).not.toBeNull();
    expect(res!.last).toBe(50);
    expect(res!.bid).toBe(0);
    expect(res!.ask).toBe(0);
  });

  it('coerces NaN fields to zero', async () => {
    client.store.set('ticker:binance:BAD', { last: 'not-a-number' });
    const res = await cache.getTicker('binance', 'BAD');
    expect(res!.last).toBe(0);
  });
});

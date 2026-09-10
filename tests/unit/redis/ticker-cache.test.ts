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

vi.mock('../../../src/redis/index', () => ({ getRedisClient: mockGetRedisClient }));

import { TickerCache } from '../../../src/redis/ticker-cache';

function makeClient() {
  const store = new Map<string, Record<string, string>>();
  return {
    store,
    pipeline: () => {
      const ops: Array<{ key: string; cmd: string; value?: unknown }> = [];
      const pipe = {
        hset: (k: string, v: Record<string, string>) => { ops.push({ key: k, cmd: 'hset', value: v }); return pipe; },
        expire: (k: string, ttl: number) => { ops.push({ key: k, cmd: 'expire', value: ttl }); return pipe; },
        hgetall: (k: string) => { ops.push({ key: k, cmd: 'hgetall' }); return pipe; },
        exec: async () => ops.map(op => {
          if (op.cmd === 'hset') { store.set(op.key, op.value as Record<string, string>); return [null, 1]; }
          if (op.cmd === 'expire') { if (store.has(op.key)) store.get(op.key)!.__ttl = op.value; return [null, 1]; }
          if (op.cmd === 'hgetall') { return [null, store.get(op.key) ?? {}]; }
          return [null, null];
        }),
      };
      return pipe;
    },
    hgetall: async (k: string) => store.get(k) ?? {},
    del: async (k: string) => { store.delete(k); return 1; },
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

  describe('getTickers (batch)', () => {
    it('returns empty map for empty input', async () => {
      const res = await cache.getTickers('binance', []);
      expect(res).toBeInstanceOf(Map);
      expect(res.size).toBe(0);
    });

    it('returns multiple tickers from pipeline', async () => {
      const t1 = makeTicker({ last: 100 });
      const t2 = makeTicker({ last: 200 });
      client.store.set('ticker:binance:BTCUSDT', { ...t1, last: '100', bid: '99', ask: '101', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000' });
      client.store.set('ticker:binance:ETHUSDT', { ...t2, last: '200', bid: '199', ask: '201', high24h: '210', low24h: '190', volume24h: '2000', timestamp: '1700000001000' });

      const res = await cache.getTickers('binance', ['BTCUSDT', 'ETHUSDT']);

      expect(res.size).toBe(2);
      expect(res.get('BTCUSDT')!.last).toBe(100);
      expect(res.get('ETHUSDT')!.last).toBe(200);
    });

    it('skips missing symbols in batch', async () => {
      const t1 = makeTicker({ last: 100 });
      client.store.set('ticker:binance:BTCUSDT', { ...t1, last: '100', bid: '99', ask: '101', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000' });

      const res = await cache.getTickers('binance', ['BTCUSDT', 'MISSING']);

      expect(res.size).toBe(1);
      expect(res.get('BTCUSDT')!.last).toBe(100);
      expect(res.has('MISSING')).toBe(false);
    });

    it('coerces NaN in batch results', async () => {
      client.store.set('ticker:binance:BAD', { last: 'not-a-number' });

      const res = await cache.getTickers('binance', ['BAD']);

      expect(res.size).toBe(1);
      expect(res.get('BAD')!.last).toBe(0);
    });

    it('returns empty map when pipeline.exec returns null', async () => {
      const nullClient = makeClient();
      nullClient.pipeline = () => ({
        hgetall: () => nullClient.pipeline(),
        exec: async () => null as unknown as never[],
      });
      mockGetRedisClient.mockReturnValue(nullClient as never);
      const nullCache = new TickerCache();

      const res = await nullCache.getTickers('binance', ['BTCUSDT']);
      expect(res.size).toBe(0);
    });
  });

  describe('getBestBidAcrossExchanges', () => {
    it('returns empty map for empty symbols', async () => {
      const res = await cache.getBestBidAcrossExchanges([], ['binance']);
      expect(res.size).toBe(0);
    });

    it('returns empty map for empty exchanges', async () => {
      const res = await cache.getBestBidAcrossExchanges(['BTCUSDT'], []);
      expect(res.size).toBe(0);
    });

    it('finds best bid across exchanges', async () => {
      // binance bid 100
      client.store.set('ticker:binance:BTCUSDT', { bid: '100', ask: '102', last: '101', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000' });
      // bybit bid 105 (better)
      client.store.set('ticker:bybit:BTCUSDT', { bid: '105', ask: '107', last: '106', high24h: '115', low24h: '95', volume24h: '2000', timestamp: '1700000000000' });
      // okx bid 98 (worse)
      client.store.set('ticker:okx:BTCUSDT', { bid: '98', ask: '100', last: '99', high24h: '108', low24h: '92', volume24h: '1500', timestamp: '1700000000000' });

      const res = await cache.getBestBidAcrossExchanges(['BTCUSDT'], ['binance', 'bybit', 'okx']);

      expect(res.size).toBe(1);
      expect(res.get('BTCUSDT')!.exchange).toBe('bybit');
      expect(res.get('BTCUSDT')!.bid).toBe(105);
    });

    it('handles missing exchanges gracefully', async () => {
      client.store.set('ticker:binance:BTCUSDT', { bid: '100', ask: '102', last: '101', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000' });

      const res = await cache.getBestBidAcrossExchanges(['BTCUSDT'], ['binance', 'missing']);

      expect(res.size).toBe(1);
      expect(res.get('BTCUSDT')!.exchange).toBe('binance');
      expect(res.get('BTCUSDT')!.bid).toBe(100);
    });

    it('coerces NaN bid to zero and skips it', async () => {
      client.store.set('ticker:binance:BTCUSDT', { bid: 'not-a-number', ask: '102', last: '101', high24h: '110', low24h: '90', volume24h: '1000', timestamp: '1700000000000' });

      const res = await cache.getBestBidAcrossExchanges(['BTCUSDT'], ['binance']);

      // NaN bid coerces to 0; 0 > 0 is false so it is not recorded as best
      expect(res.size).toBe(0);
    });

    it('returns empty map when pipeline.exec returns null', async () => {
      const nullClient = makeClient();
      nullClient.pipeline = () => ({
        hgetall: () => nullClient.pipeline(),
        exec: async () => null as unknown as never[],
      });
      mockGetRedisClient.mockReturnValue(nullClient as never);
      const nullCache = new TickerCache();

      const res = await nullCache.getBestBidAcrossExchanges(['BTCUSDT'], ['binance']);
      expect(res.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('deletes the ticker key', async () => {
      const delSpy = vi.spyOn(client, 'del').mockResolvedValue(1);
      await cache.clear('binance', 'BTCUSDT');
      expect(delSpy).toHaveBeenCalledWith('ticker:binance:BTCUSDT');
    });

    it('handles non-existent key', async () => {
      const delSpy = vi.spyOn(client, 'del').mockResolvedValue(0);
      await cache.clear('binance', 'NONEXISTENT');
      expect(delSpy).toHaveBeenCalledWith('ticker:binance:NONEXISTENT');
    });
  });
});

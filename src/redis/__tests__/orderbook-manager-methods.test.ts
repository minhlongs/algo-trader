/**
 * Tests for OrderbookManager methods — Redis ZSET-backed L2 orderbook.
 *
 * getRedisClient is mocked with an in-memory fake so no real Redis is needed.
 * Covers key naming, tx pipeline (del/zadd/expire), best bid/ask parsing,
 * top-N levels, depth reduction, and clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: (() => {
    const store = new Map<string, Array<{ score: number; value: string }>>();
    const pipeline = () => {
      const ops: Array<() => void> = [];
      return {
        del: (...keys: string[]) => void ops.push(() => keys.forEach((k) => store.delete(k))),
        zadd: (key: string, ...args: (string | number)[]) => {
          const pairs: Array<{ score: number; value: string }> = [];
          for (let i = 0; i < args.length; i += 2) {
            pairs.push({ score: Number(args[i]), value: String(args[i + 1]) });
          }
          ops.push(() => {
            const z = store.get(key) ?? [];
            for (const p of pairs) {
              const existing = z.findIndex((e) => e.value === p.value);
              if (existing >= 0) z.splice(existing, 1);
              z.push(p);
            }
            store.set(key, z);
          });
        },
        expire: () => {},
        exec: async () => {
          for (const op of ops) op();
          return [];
        },
      };
    };
    return {
      _store: store,
      multi: pipeline,
      zrange: async (key: string, start: number, stop: number) => {
        const z = (store.get(key) ?? []).slice().sort((a, b) => a.score - b.score);
        const arr = z.map((e) => e.value);
        if (stop === -1) return arr.slice(start);
        return arr.slice(start, stop + 1);
      },
      del: async (...keys: (string | string[])[]) => {
        const flat = keys.flat();
        let n = 0;
        for (const k of flat) if (store.delete(k)) n++;
        return n;
      },
    };
  })(),
}));

vi.mock('../index', () => ({ getRedisClient: () => mockRedis }));

import { OrderbookManager, type OrderBookLevel } from '../orderbook-manager';

const BIDS: OrderBookLevel[] = [
  { price: 100.5, amount: 2 },
  { price: 100.4, amount: 3 },
  { price: 100.3, amount: 1 },
];
const ASKS: OrderBookLevel[] = [
  { price: 100.6, amount: 1.5 },
  { price: 100.7, amount: 4 },
  { price: 100.8, amount: 2 },
];

describe('OrderbookManager', () => {
  let mgr: OrderbookManager;

  beforeEach(() => {
    mockRedis._store.clear();
    mgr = new OrderbookManager();
  });

  it('updateOrderbook writes bids (negated scores) and asks via a pipeline', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);

    const bidsKey = 'orderbook:{binance:BTC/USDT}:bids';
    const asksKey = 'orderbook:{binance:BTC/USDT}:asks';
    expect(mockRedis._store.has(bidsKey)).toBe(true);
    expect(mockRedis._store.has(asksKey)).toBe(true);

    const bidScores = mockRedis._store.get(bidsKey)!.map((e) => e.score);
    expect(bidScores).toContain(-100.5);
    expect(bidScores).toContain(-100.4);
    expect(mockRedis._store.get(asksKey)!.map((e) => e.value)).toContain('100.6:1.5');
  });

  it('updateOrderbook replaces previous state (del before zadd)', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    await mgr.updateOrderbook('binance', 'BTC/USDT', [{ price: 90, amount: 1 }], []);
    const bids = mockRedis._store.get('orderbook:{binance:BTC/USDT}:bids')!;
    expect(bids).toHaveLength(1);
    expect(bids[0].value).toBe('90:1');
  });

  it('updateOrderbook handles empty level arrays without zadd', async () => {
    await mgr.updateOrderbook('okx', 'ETH/USDT', [], []);
    expect(mockRedis._store.size).toBe(0);
  });

  it('getBestBid returns the highest bid (first in negated-score order)', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    const best = await mgr.getBestBid('binance', 'BTC/USDT');
    expect(best).toEqual({ price: 100.5, amount: 2 });
  });

  it('getBestBid returns null when book is empty', async () => {
    expect(await mgr.getBestBid('binance', 'BTC/USDT')).toBeNull();
  });

  it('getBestAsk returns the lowest ask', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    const best = await mgr.getBestAsk('binance', 'BTC/USDT');
    expect(best).toEqual({ price: 100.6, amount: 1.5 });
  });

  it('getBestAsk returns null when book is empty', async () => {
    expect(await mgr.getBestAsk('binance', 'BTC/USDT')).toBeNull();
  });

  it('getTopLevels returns parsed levels in price order', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    const { bids, asks } = await mgr.getTopLevels('binance', 'BTC/USDT', 2);
    expect(bids).toEqual([{ price: 100.5, amount: 2 }, { price: 100.4, amount: 3 }]);
    expect(asks).toEqual([{ price: 100.6, amount: 1.5 }, { price: 100.7, amount: 4 }]);
  });

  it('getTopLevels defaults to 10 levels and tolerates empty keys', async () => {
    const { bids, asks } = await mgr.getTopLevels('binance', 'BTC/USDT');
    expect(bids).toEqual([]);
    expect(asks).toEqual([]);
  });

  it('getDepth sums amounts across levels', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    const { bidDepth, askDepth } = await mgr.getDepth('binance', 'BTC/USDT');
    expect(bidDepth).toBeCloseTo(6, 5);
    expect(askDepth).toBeCloseTo(7.5, 5);
  });

  it('clear deletes both sides of the book', async () => {
    await mgr.updateOrderbook('binance', 'BTC/USDT', BIDS, ASKS);
    await mgr.clear('binance', 'BTC/USDT');
    expect(mockRedis._store.size).toBe(0);
  });
});
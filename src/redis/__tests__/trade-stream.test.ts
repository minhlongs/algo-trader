/**
 * Tests for TradeStream — Redis Streams-backed trade history.
 *
 * getRedisClient is mocked with a fake ioredis-like client (xadd / xrange /
 * xtrim / del) so addTrade, getRecentTrades, getTradesSince (incl. drift
 * buffer + timestamp filter), trim, and clear are exercised without a live
 * Redis server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakeRedis } = vi.hoisted(() => ({
  fakeRedis: {
    xadd: vi.fn(),
    xrange: vi.fn(),
    xtrim: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../index', () => ({ getRedisClient: () => fakeRedis }));

import { TradeStream, type Trade } from '../trade-stream';

/** Build a raw xrange entry: [id, [field, value, field, value...]]. */
function rawEntry(id: string, fields: Record<string, string>): [string, string[]] {
  const flat: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    flat.push(k, v);
  }
  return [id, flat];
}

function sampleTrade(): Trade {
  return {
    id: 't-1',
    price: 123.45,
    amount: 0.5,
    side: 'buy',
    timestamp: 1750000000000,
    tradeId: 'trade-abc',
  };
}

describe('TradeStream', () => {
  let stream: TradeStream;

  beforeEach(() => {
    vi.clearAllMocks();
    stream = new TradeStream();
  });

  // ── addTrade ─────────────────────────────────────────────────────────────

  it('adds a trade with XADD MAXLEN and returns the stream id', async () => {
    fakeRedis.xadd.mockResolvedValue('1750000000000-0');
    const result = await stream.addTrade('binance', 'BTC/USDT', sampleTrade());
    expect(fakeRedis.xadd).toHaveBeenCalledWith(
      'trades:binance:BTC/USDT',
      'MAXLEN', '~', '10000', '*',
      'id', 't-1',
      'price', '123.45',
      'amount', '0.5',
      'side', 'buy',
      'timestamp', '1750000000000',
      'tradeId', 'trade-abc',
    );
    expect(result).toBe('1750000000000-0');
  });

  it('defaults tradeId to empty string when omitted', async () => {
    fakeRedis.xadd.mockResolvedValue('1-1');
    const trade = { ...sampleTrade(), tradeId: undefined };
    await stream.addTrade('binance', 'BTC/USDT', trade);
    const args = fakeRedis.xadd.mock.calls[0]!;
    expect(args[args.length - 1]).toBe('');
  });

  it('returns empty string when xadd returns null', async () => {
    fakeRedis.xadd.mockResolvedValue(null);
    const result = await stream.addTrade('binance', 'BTC/USDT', sampleTrade());
    expect(result).toBe('');
  });

  // ── getRecentTrades ───────────────────────────────────────────────────────

  it('queries xrange with full range and the requested count', async () => {
    fakeRedis.xrange.mockResolvedValue([]);
    await stream.getRecentTrades('binance', 'BTC/USDT', 42);
    expect(fakeRedis.xrange).toHaveBeenCalledWith(
      'trades:binance:BTC/USDT', '-', '+', 'COUNT', 42);
  });

  it('defaults count to 100', async () => {
    fakeRedis.xrange.mockResolvedValue([]);
    await stream.getRecentTrades('binance', 'BTC/USDT');
    expect(fakeRedis.xrange).toHaveBeenCalledWith(
      'trades:binance:BTC/USDT', '-', '+', 'COUNT', 100);
  });

  it('parses raw entries into Trade objects', async () => {
    fakeRedis.xrange.mockResolvedValue([
      rawEntry('1-1', {
        id: 't-1', price: '123.45', amount: '0.5',
        side: 'sell', timestamp: '1750000000000', tradeId: 'trade-abc',
      }),
      rawEntry('2-2', {
        id: 't-2', price: '99', amount: '2', side: 'buy', timestamp: '200',
      }),
    ]);
    const trades = await stream.getRecentTrades('binance', 'BTC/USDT');
    expect(trades).toEqual([
      { id: 't-1', price: 123.45, amount: 0.5, side: 'sell', timestamp: 1750000000000, tradeId: 'trade-abc' },
      { id: 't-2', price: 99, amount: 2, side: 'buy', timestamp: 200, tradeId: undefined },
    ]);
  });

  it('falls back to defaults when entry fields are missing or unparseable', async () => {
    fakeRedis.xrange.mockResolvedValue([
      rawEntry('3-3', { id: '', price: 'not-a-number', timestamp: 'bad' }),
      ['4-4', ['price', '5']],
    ]);
    const trades = await stream.getRecentTrades('binance', 'BTC/USDT');
    expect(trades[0]).toEqual({
      id: '', price: 0, amount: 0, side: 'buy', timestamp: 0, tradeId: undefined,
    });
    expect(trades[1]).toEqual({
      id: '', price: 5, amount: 0, side: 'buy', timestamp: 0, tradeId: undefined,
    });
  });

  // ── getTradesSince ────────────────────────────────────────────────────────

  it('queries xrange with a 10s drift buffer before the requested timestamp', async () => {
    fakeRedis.xrange.mockResolvedValue([]);
    await stream.getTradesSince('binance', 'BTC/USDT', 1750000010000);
    const startId = fakeRedis.xrange.mock.calls[0]![1] as string;
    // 1750000010000 - 10000 = 1750000000000
    expect(startId).toBe('1750000000000-0');
  });

  it('clamps the query start to 0 when the timestamp is within the buffer', async () => {
    fakeRedis.xrange.mockResolvedValue([]);
    await stream.getTradesSince('binance', 'BTC/USDT', 5000);
    const startId = fakeRedis.xrange.mock.calls[0]![1] as string;
    expect(startId).toBe('0-0');
  });

  it('returns only trades at or after the requested timestamp', async () => {
    fakeRedis.xrange.mockResolvedValue([
      rawEntry('1-1', { id: 'a', price: '1', amount: '1', side: 'buy', timestamp: '9000' }),
      rawEntry('2-2', { id: 'b', price: '2', amount: '1', side: 'buy', timestamp: '10000' }),
      rawEntry('3-3', { id: 'c', price: '3', amount: '1', side: 'buy', timestamp: '11000' }),
    ]);
    const trades = await stream.getTradesSince('binance', 'BTC/USDT', 10000);
    expect(trades.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('parses entries identically to getRecentTrades', async () => {
    fakeRedis.xrange.mockResolvedValue([
      rawEntry('1-1', {
        id: 't-1', price: '123.45', amount: '0.5',
        side: 'sell', timestamp: '1750000000000', tradeId: 'trade-abc',
      }),
    ]);
    const trades = await stream.getTradesSince('binance', 'BTC/USDT', 0);
    expect(trades).toEqual([{
      id: 't-1', price: 123.45, amount: 0.5, side: 'sell',
      timestamp: 1750000000000, tradeId: 'trade-abc',
    }]);
  });

  // ── trim / clear ──────────────────────────────────────────────────────────

  it('trims the stream with XTRIM MAXLEN ~', async () => {
    fakeRedis.xtrim.mockResolvedValue(3);
    await stream.trim('binance', 'BTC/USDT', 500);
    expect(fakeRedis.xtrim).toHaveBeenCalledWith(
      'trades:binance:BTC/USDT', 'MAXLEN', '~', 500);
  });

  it('defaults maxLen to 10000 when trimming', async () => {
    fakeRedis.xtrim.mockResolvedValue(0);
    await stream.trim('binance', 'BTC/USDT');
    expect(fakeRedis.xtrim).toHaveBeenCalledWith(
      'trades:binance:BTC/USDT', 'MAXLEN', '~', 10000);
  });

  it('clears the stream key with DEL', async () => {
    fakeRedis.del.mockResolvedValue(1);
    await stream.clear('binance', 'BTC/USDT');
    expect(fakeRedis.del).toHaveBeenCalledWith('trades:binance:BTC/USDT');
  });
});
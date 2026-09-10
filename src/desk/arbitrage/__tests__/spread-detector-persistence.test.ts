/**
 * Tests for spread-detector-persistence — store and load of arbitrage
 * opportunities via a Redis-like pipeline interface. Stateless helpers.
 *
 * A fake pipeline is injected via the SpreadDetectorRedis contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { storeOpportunityToRedis, loadRecentOpportunities } from '../spread-detector-persistence';
import type { ArbitrageOpportunity, SpreadDetectorRedis } from '../spread-detector-types';

function makePipeline() {
  return {
    hset: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRedis(overrides: Partial<SpreadDetectorRedis> = {}): SpreadDetectorRedis & {
  _calls: ReturnType<typeof makePipeline>[];
} {
  const _calls: ReturnType<typeof makePipeline>[] = [];
  return {
    _calls,
    keys: vi.fn().mockResolvedValue([]),
    hgetall: vi.fn().mockResolvedValue({}),
    pipeline: vi.fn(() => {
      const p = makePipeline();
      _calls.push(p);
      return p;
    }),
    ...overrides,
  } as unknown as SpreadDetectorRedis & { _calls: ReturnType<typeof makePipeline>[] };
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

describe('storeOpportunityToRedis', () => {
  it('writes the opportunity to Redis with a 60s TTL via a pipeline', async () => {
    const redis = makeRedis();
    await storeOpportunityToRedis(redis, makeOpp({ score: 42 }));
    expect(redis._calls).toHaveLength(1);
    const pipeline = redis._calls[0]!;
    expect(pipeline.hset).toHaveBeenCalledWith(
      'arbitrage:opportunities:opp-1',
      expect.objectContaining({
        id: 'opp-1',
        buyPrice: '50000',
        sellPrice: '50100',
        spread: '100',
        spreadPercent: '0.2',
        score: '42',
        latency: '12',
      }),
    );
    expect(pipeline.expire).toHaveBeenCalledWith('arbitrage:opportunities:opp-1', 60);
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it('writes an empty score string when score is undefined', async () => {
    const redis = makeRedis();
    await storeOpportunityToRedis(redis, makeOpp());
    const pipeline = redis._calls[0]!;
    const data = pipeline.hset.mock.calls[0][1] as Record<string, string>;
    expect(data.score).toBe('');
  });
});

describe('loadRecentOpportunities', () => {
  it('returns an empty array when there are no keys', async () => {
    const redis = makeRedis();
    expect(await loadRecentOpportunities(redis)).toEqual([]);
  });

  it('returns an empty array when keys exist but hgetall returns empty', async () => {
    const redis = makeRedis({ keys: vi.fn().mockResolvedValue(['arbitrage:opportunities:x']) });
    expect(await loadRecentOpportunities(redis)).toEqual([]);
  });

  it('parses and sorts opportunities by timestamp descending', async () => {
    const redis = makeRedis({
      keys: vi.fn().mockResolvedValue(['arbitrage:opportunities:a', 'arbitrage:opportunities:b']),
      hgetall: vi.fn()
        .mockResolvedValueOnce({
          id: 'a', symbol: 'BTC', buyExchange: 'binance', sellExchange: 'kraken',
          buyPrice: '50000', sellPrice: '50100', spread: '100', spreadPercent: '0.2',
          timestamp: '100', latency: '5', score: '10',
        })
        .mockResolvedValueOnce({
          id: 'b', symbol: 'ETH', buyExchange: 'binance', sellExchange: 'kraken',
          buyPrice: '100', sellPrice: '101', spread: '1', spreadPercent: '0.01',
          timestamp: '300', latency: '5',
        }),
    });
    const result = await loadRecentOpportunities(redis);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b'); // newer timestamp first
    expect(result[1].timestamp).toBe(100);
    expect(result[0].timestamp).toBe(300);
    expect(result[0].score).toBeUndefined(); // no score key in payload
    expect(result[1].score).toBe(10);
  });

  it('falls back to zero when numeric fields are missing', async () => {
    const redis = makeRedis({
      keys: vi.fn().mockResolvedValue(['arbitrage:opportunities:x']),
      hgetall: vi.fn().mockResolvedValue({ id: 'x', symbol: '', buyExchange: '', sellExchange: '' }),
    });
    const [opp] = await loadRecentOpportunities(redis);
    expect(opp).toEqual({
      id: 'x', symbol: '', buyExchange: '', sellExchange: '',
      buyPrice: 0, sellPrice: 0, spread: 0, spreadPercent: 0,
      timestamp: 0, latency: 0, score: undefined,
    });
  });

  it('respects the count limit', async () => {
    const redis = makeRedis({
      keys: vi.fn().mockResolvedValue([
        'arbitrage:opportunities:a', 'arbitrage:opportunities:b',
        'arbitrage:opportunities:c', 'arbitrage:opportunities:d',
      ]),
      hgetall: vi.fn().mockImplementation((key: string) => {
        const suffix = key.split(':')[2];
        return Promise.resolve({ id: suffix, symbol: '', buyExchange: '', sellExchange: '', timestamp: suffix === 'c' ? '300' : '100' });
      }),
    });
    const result = await loadRecentOpportunities(redis, 2);
    expect(result).toHaveLength(2);
  });
});

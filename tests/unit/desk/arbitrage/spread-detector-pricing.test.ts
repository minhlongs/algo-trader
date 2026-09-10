/**
 * Tests for spread-detector-pricing — pure pricing helpers and the pricing
 * context-driven fetchBestPrices / evaluateSpread.
 *
 * Redis is an in-memory fake with a pipeline (hgetall + exec). PricingContext
 * is constructed inline. calculateFees / calculateSlippage /
 * calculateOpportunityScore are the real implementations (no mocking).
 */

import { describe, it, expect } from 'vitest';
import {
  fetchBestPrices,
  evaluateSpread,
  getTickerKey,
  getCacheKey,
} from '../../../../src/desk/arbitrage/spread-detector-pricing';
import { createDefaultScoringModel } from '../../../../src/desk/arbitrage/spread-detector-calculations';
import type {
  PricingContext,
  SpreadConfig,
  ExchangeLatency,
  PriceCacheEntry,
  ScoringModel,
} from '../../../../src/desk/arbitrage/spread-detector-types';

function makeRedis(tickers: Record<string, Record<string, string>>) {
  const store = new Map<string, Record<string, string>>();
  for (const [k, v] of Object.entries(tickers)) store.set(k, v);
  return {
    pipeline: () => {
      const ops: Array<() => Record<string, string>> = [];
      return {
        hgetall: (key: string) => {
          ops.push(() => store.get(key) ?? {});
          return this;
        },
        exec: async () => ops.map((op) => op()),
      };
    },
    hgetall: async (key: string) => store.get(key) ?? {},
  };
}

function makeCtx(overrides: Partial<SpreadConfig> = {}): PricingContext {
  const config: SpreadConfig = {
    minSpreadPercent: 0.5,
    maxLatencyMs: 500,
    checkIntervalMs: 1000,
    enableMLScoring: true,
    enableLatencyOptimization: false,
    cacheTTL: 60_000,
    parallelBatchSize: 10,
    ...overrides,
  };
  const scoringModel: ScoringModel = createDefaultScoringModel();
  const latency: ExchangeLatency = {
    exchange: 'binance',
    avgLatency: 20,
    p95Latency: 50,
    p99Latency: 80,
    samples: [],
  };
  return {
    redis: makeRedis({ 'ticker:binance:BTC/USDT': { bid: '50000', ask: '50050' } }) as any,
    priceCache: new Map<string, PriceCacheEntry>(),
    config,
    scoringModel,
    getExchangeLatency: () => latency,
  };
}

describe('getTickerKey / getCacheKey', () => {
  it('builds Redis ticker key with exchange and symbol', () => {
    expect(getTickerKey('binance', 'BTC/USDT')).toBe('ticker:binance:BTC/USDT');
  });
  it('builds in-memory cache key', () => {
    expect(getCacheKey('binance', 'BTC/USDT')).toBe('binance:BTC/USDT');
  });
});

describe('fetchBestPrices', () => {
  it('returns best bid/ask plus all prices from pipelined tickers', async () => {
    const ctx = makeCtx();
    ctx.redis = makeRedis({
      'ticker:binance:BTC/USDT': { bid: '50000', ask: '50050' },
      'ticker:okx:BTC/USDT': { bid: '50010', ask: '50070' },
    }) as any;
    ctx.getExchangeLatency = (ex: string) => ({
      exchange: ex,
      avgLatency: 10,
      p95Latency: ex === 'binance' ? 50 : 60,
      p99Latency: 90,
      samples: [],
    });

    const result = await fetchBestPrices(ctx, 'BTC/USDT', ['binance', 'okx']);
    expect(result.bestBid).toEqual({ exchange: 'okx', price: 50010, latency: 60 });
    expect(result.bestAsk).toEqual({ exchange: 'binance', price: 50050, latency: 50 });
    expect(result.allPrices).toHaveLength(2);
  });

  it('falls back to in-memory cache when Redis misses', async () => {
    const ctx = makeCtx();
    ctx.redis = makeRedis({}) as any;
    const cached: PriceCacheEntry = {
      bid: 49900,
      ask: 50000,
      timestamp: Date.now() - 5000,
      exchange: 'binance',
      symbol: 'BTC/USDT',
      latency: 50,
    };
    ctx.priceCache.set('binance:BTC/USDT', cached);

    const result = await fetchBestPrices(ctx, 'BTC/USDT', ['binance']);
    expect(result.bestBid).toEqual({ exchange: 'binance', price: 49900, latency: 50 });
    expect(result.bestAsk).toEqual({ exchange: 'binance', price: 50000, latency: 50 });
  });

  it('returns nulls when no prices are available', async () => {
    const ctx = makeCtx();
    ctx.redis = makeRedis({}) as any;
    const result = await fetchBestPrices(ctx, 'BTC/USDT', ['binance']);
    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
    expect(result.allPrices).toHaveLength(0);
  });

  it('skips entries where bid or ask parse to zero', async () => {
    const ctx = makeCtx();
    ctx.redis = makeRedis({
      'ticker:binance:BTC/USDT': { bid: 'bad', ask: 'bad' },
    }) as any;
    const result = await fetchBestPrices(ctx, 'BTC/USDT', ['binance']);
    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
  });

  it('does not use stale in-memory cache beyond cacheTTL', async () => {
    const ctx = makeCtx({ cacheTTL: 1000 });
    ctx.redis = makeRedis({}) as any;
    const cached: PriceCacheEntry = {
      bid: 49900,
      ask: 50000,
      timestamp: Date.now() - 2000,
      exchange: 'binance',
      symbol: 'BTC/USDT',
      latency: 50,
    };
    ctx.priceCache.set('binance:BTC/USDT', cached);

    const result = await fetchBestPrices(ctx, 'BTC/USDT', ['binance']);
    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
  });
});

describe('evaluateSpread', () => {
  const baseBid = { exchange: 'okx', price: 50100, latency: 60 };
  const baseAsk = { exchange: 'binance', price: 50050, latency: 50 };

  it('returns null when spread is below minSpreadPercent', async () => {
    const ctx = makeCtx({ minSpreadPercent: 5 });
    const result = await evaluateSpread(ctx, 'BTC/USDT', baseBid, baseAsk, 100);
    expect(result).toBeNull();
  });

  it('returns null when the base spread is eaten by fees and slippage', async () => {
    const ctx = makeCtx({ minSpreadPercent: 0.1 });
    const result = await evaluateSpread(ctx, 'BTC/USDT', baseBid, baseAsk, 100);
    expect(result).toBeNull();
  });

  it('returns an opportunity with undefined score when ML scoring is disabled', async () => {
    const ctx = makeCtx({ minSpreadPercent: 0.1, enableMLScoring: false });
    const wideBid = { exchange: 'okx', price: 51000, latency: 30 };
    const wideAsk = { exchange: 'binance', price: 50050, latency: 30 };
    const result = await evaluateSpread(ctx, 'BTC/USDT', wideBid, wideAsk, 30);
    expect(result).not.toBeNull();
    expect(result!.score).toBeUndefined();
    expect(result!.confidence).toBeUndefined();
    expect(result!.symbol).toBe('BTC/USDT');
  });

  it('returns null when score is below minScore threshold', async () => {
    const ctx = makeCtx({ minSpreadPercent: 0.01 });
    const tightBid = { exchange: 'okx', price: 50055, latency: 500 };
    const tightAsk = { exchange: 'binance', price: 50050, latency: 500 };
    const result = await evaluateSpread(ctx, 'BTC/USDT', tightBid, tightAsk, 500);
    expect(result).toBeNull();
  });

  it('produces medium (not high) confidence when score clears min but not high', async () => {
    const ctx = makeCtx({ minSpreadPercent: 0.01 });
    const wideBid = { exchange: 'okx', price: 51000, latency: 30 };
    const wideAsk = { exchange: 'binance', price: 50050, latency: 30 };
    const result = await evaluateSpread(ctx, 'BTC/USDT', wideBid, wideAsk, 30);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(61);
    expect(result!.confidence).toBe('medium');
  });
});
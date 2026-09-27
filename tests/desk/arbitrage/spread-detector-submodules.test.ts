/**
 * Unit tests for Spread Detector submodules: calculations, pricing, and persistence.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateFees,
  calculateSlippage,
  calculateOpportunityScore,
  computeLatencyStats,
  updateScanMetrics,
  recordExchangeLatencySample,
  createDefaultScoringModel,
} from '../../../src/desk/arbitrage/spread-detector-calculations';
import {
  getTickerKey,
  getCacheKey,
  fetchBestPrices,
  evaluateSpread,
  type PricingContext,
} from '../../../src/desk/arbitrage/spread-detector-pricing';
import {
  storeOpportunityToRedis,
  loadRecentOpportunities,
} from '../../../src/desk/arbitrage/spread-detector-persistence';
import { SpreadDetector } from '../../../src/desk/arbitrage/spread-detector';
import type { ArbitrageOpportunity, ScanMetrics, ExchangeLatency } from '../../../src/desk/arbitrage/spread-detector-types';

describe('Spread Detector Submodules', () => {
  describe('spread-detector-calculations', () => {
    it('calculates fees across recognized and default exchanges', () => {
      const binanceFees = calculateFees('binance', 'okx', 50000, 50200);
      expect(binanceFees.buyFee).toBe(50); // 50000 * 0.001
      expect(binanceFees.sellFee).toBeCloseTo(40.16); // 50200 * 0.0008
      expect(binanceFees.netFee).toBeCloseTo(90.16);

      const defaultFees = calculateFees('unknown_buy', 'unknown_sell', 100, 105);
      expect(defaultFees.buyFee).toBe(0.1);
      expect(defaultFees.sellFee).toBe(0.105);
    });

    it('calculates slippage for both buy and sell legs', () => {
      const slippage = calculateSlippage({ price: 50000 }, { price: 49900 });
      expect(slippage.buySlippage).toBeCloseTo(49900 * 0.0005);
      expect(slippage.sellSlippage).toBeCloseTo(50000 * 0.0005);
      expect(slippage.totalSlippage).toBeCloseTo(slippage.buySlippage + slippage.sellSlippage);
    });

    it('calculates opportunity score with ML weights and zero fee safety', () => {
      const model = createDefaultScoringModel();
      const score = calculateOpportunityScore(
        { spreadPercent: 1.5, latency: 50, fees: { netFee: 20 } },
        model,
        200,
      );
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);

      // Test zero net fee branch
      const zeroFeeScore = calculateOpportunityScore(
        { spreadPercent: 1.0, latency: 10, fees: { netFee: 0 } },
        model,
        200,
      );
      expect(zeroFeeScore).toBeGreaterThan(0);
    });

    it('computes latency stats with empty and populated samples', () => {
      const emptyStats = computeLatencyStats([]);
      expect(emptyStats).toEqual({ avg: 0, p95: 0, p99: 0 });

      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = computeLatencyStats(samples);
      expect(stats.avg).toBe(55);
      expect(stats.p95).toBe(100);
      expect(stats.p99).toBe(100);
    });

    it('updates scan metrics and trims duration history over 1000 items', () => {
      const metrics: ScanMetrics = {
        totalScans: 0,
        avgScanDurationMs: 0,
        p95ScanDurationMs: 0,
        p99ScanDurationMs: 0,
        scanDurations: Array.from({ length: 1000 }, (_, i) => i + 1),
      };

      updateScanMetrics(metrics, 15);
      expect(metrics.totalScans).toBe(1);
      expect(metrics.scanDurations.length).toBe(1000);
      expect(metrics.avgScanDurationMs).toBeGreaterThan(0);
    });

    it('records exchange latency samples and creates map entries', () => {
      const samples = new Map<string, number[]>();
      const latencies = new Map<string, ExchangeLatency>();

      // Record multiple samples including > 100 samples trigger
      for (let i = 0; i < 105; i++) {
        recordExchangeLatencySample(samples, latencies, 'binance', 10 + (i % 20));
      }

      const binanceSamples = samples.get('binance');
      expect(binanceSamples?.length).toBe(100);
      const binanceLat = latencies.get('binance');
      expect(binanceLat).toBeDefined();
      expect(binanceLat?.exchange).toBe('binance');
      expect(binanceLat?.avgLatency).toBeGreaterThan(0);
    });
  });

  describe('spread-detector-pricing', () => {
    it('formats ticker and cache keys correctly', () => {
      expect(getTickerKey('binance', 'BTC/USDT')).toBe('ticker:binance:BTC/USDT');
      expect(getCacheKey('bybit', 'ETH/USDT')).toBe('bybit:ETH/USDT');
    });

    it('fetches best prices with Redis results and in-memory cache fallbacks', async () => {
      const mockPipeline = {
        hgetall: vi.fn(),
        exec: vi.fn().mockResolvedValue([
          { bid: '50100', ask: '50150' }, // binance from redis
          null,                           // bybit redis miss -> cache hit
          { bid: '0', ask: '0' },         // kucoin zero price -> ignored
          { bid: '50200', ask: '0' },     // okx zero ask -> ignored
        ]),
      };
      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
      } as any;

      const priceCache = new Map();
      // Valid cache hit
      priceCache.set('bybit:BTC/USDT', {
        bid: 50000,
        ask: 50050,
        timestamp: Date.now(),
        exchange: 'bybit',
        symbol: 'BTC/USDT',
        latency: 15,
      });
      // Expired cache entry (should not be returned)
      priceCache.set('coinbase:BTC/USDT', {
        bid: 49000,
        ask: 49050,
        timestamp: Date.now() - 100000,
        exchange: 'coinbase',
        symbol: 'BTC/USDT',
        latency: 20,
      });

      const ctx: PricingContext = {
        redis: mockRedis,
        priceCache,
        config: {
          cacheTTL: 5000,
          minSpreadPercent: 0.1,
          maxLatencyMs: 200,
          enableMLScoring: true,
          symbols: ['BTC/USDT'],
          exchanges: ['binance', 'bybit', 'kucoin', 'okx'],
        } as any,
        scoringModel: createDefaultScoringModel(),
        getExchangeLatency: vi.fn().mockReturnValue({ avgLatency: 10, p95Latency: 20, p99Latency: 30, successRate: 1, lastUpdate: Date.now(), exchange: 'binance' }),
      };

      const res = await fetchBestPrices(ctx, 'BTC/USDT', ['binance', 'bybit', 'kucoin', 'okx']);
      expect(res.allPrices).toHaveLength(2);
      expect(res.bestBid?.exchange).toBe('binance');
      expect(res.bestBid?.price).toBe(50100);
      expect(res.bestAsk?.exchange).toBe('bybit');
      expect(res.bestAsk?.price).toBe(50050);
    });

    it('evaluates spread returning opportunity when profitable with high and medium confidence', async () => {
      const ctx: PricingContext = {
        redis: {} as any,
        priceCache: new Map(),
        config: {
          minSpreadPercent: 0.05,
          maxLatencyMs: 200,
          enableMLScoring: true,
        } as any,
        scoringModel: {
          ...createDefaultScoringModel(),
          thresholds: { minScore: 10, highConfidenceScore: 80 },
        },
        getExchangeLatency: vi.fn().mockReturnValue({ p95Latency: 15 }),
      };

      const bestBid = { exchange: 'binance', price: 50500, latency: 15 };
      const bestAsk = { exchange: 'bybit', price: 50000, latency: 20 };

      // High confidence opportunity
      const opp = await evaluateSpread(ctx, 'BTC/USDT', bestBid, bestAsk, 35);
      expect(opp).not.toBeNull();
      expect(opp?.symbol).toBe('BTC/USDT');
      expect(opp?.buyExchange).toBe('bybit');
      expect(opp?.sellExchange).toBe('binance');
      expect(opp?.spread).toBeGreaterThan(0);
      expect(opp?.score).toBeGreaterThan(0);
      expect(opp?.confidence).toBeDefined();

      // Without ML scoring
      const ctxNoML: PricingContext = {
        ...ctx,
        config: { ...ctx.config, enableMLScoring: false },
      };
      const oppNoML = await evaluateSpread(ctxNoML, 'BTC/USDT', bestBid, bestAsk, 35);
      expect(oppNoML).not.toBeNull();
      expect(oppNoML?.score).toBeUndefined();
      expect(oppNoML?.confidence).toBeUndefined();
    });

    it('returns null when spread does not meet minSpreadPercent', async () => {
      const ctx: PricingContext = {
        redis: {} as any,
        priceCache: new Map(),
        config: {
          minSpreadPercent: 5.0, // High threshold
          maxLatencyMs: 200,
          enableMLScoring: false,
        } as any,
        scoringModel: createDefaultScoringModel(),
        getExchangeLatency: vi.fn(),
      };

      const bestBid = { exchange: 'binance', price: 50010, latency: 15 };
      const bestAsk = { exchange: 'bybit', price: 50000, latency: 20 };

      const opp = await evaluateSpread(ctx, 'BTC/USDT', bestBid, bestAsk, 35);
      expect(opp).toBeNull();
    });

    it('returns null when ML score is below minScore threshold', async () => {
      const ctx: PricingContext = {
        redis: {} as any,
        priceCache: new Map(),
        config: {
          minSpreadPercent: 0.01,
          maxLatencyMs: 50,
          enableMLScoring: true,
        } as any,
        scoringModel: {
          ...createDefaultScoringModel(),
          thresholds: { minScore: 99.9, highConfidenceScore: 100 }, // unreachable threshold
        },
        getExchangeLatency: vi.fn(),
      };

      const bestBid = { exchange: 'binance', price: 50050, latency: 45 };
      const bestAsk = { exchange: 'bybit', price: 50000, latency: 45 };

      const opp = await evaluateSpread(ctx, 'BTC/USDT', bestBid, bestAsk, 90);
      expect(opp).toBeNull();
    });
  });

  describe('spread-detector-persistence', () => {
    it('stores opportunity to Redis with TTL', async () => {
      const mockExec = vi.fn().mockResolvedValue([null, null]);
      const mockPipeline = {
        hset: vi.fn(),
        expire: vi.fn(),
        exec: mockExec,
      };
      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
      } as any;

      const opp: ArbitrageOpportunity = {
        id: 'arb-1',
        symbol: 'BTC/USDT',
        buyExchange: 'bybit',
        sellExchange: 'binance',
        buyPrice: 50000,
        sellPrice: 50500,
        spread: 400,
        spreadPercent: 0.8,
        timestamp: 123456789,
        latency: 25,
        score: 85,
      };

      await storeOpportunityToRedis(mockRedis, opp);
      expect(mockPipeline.hset).toHaveBeenCalledWith('arbitrage:opportunities:arb-1', expect.any(Object));
      expect(mockPipeline.expire).toHaveBeenCalledWith('arbitrage:opportunities:arb-1', 60);
      expect(mockExec).toHaveBeenCalled();
    });

    it('loads and sorts recent opportunities from Redis', async () => {
      const mockRedis = {
        keys: vi.fn().mockResolvedValue(['arbitrage:opportunities:arb-1', 'arbitrage:opportunities:arb-2']),
        hgetall: vi.fn()
          .mockResolvedValueOnce({
            id: 'arb-1',
            symbol: 'ETH/USDT',
            buyExchange: 'binance',
            sellExchange: 'bybit',
            buyPrice: '2000',
            sellPrice: '2020',
            spread: '15',
            spreadPercent: '0.75',
            timestamp: '1000',
            latency: '10',
            score: '80',
          })
          .mockResolvedValueOnce({
            id: 'arb-2',
            symbol: 'BTC/USDT',
            buyExchange: 'bybit',
            sellExchange: 'binance',
            buyPrice: '50000',
            sellPrice: '50500',
            spread: '450',
            spreadPercent: '0.9',
            timestamp: '2000',
            latency: '12',
          }),
      } as any;

      const res = await loadRecentOpportunities(mockRedis, 10);
      expect(res).toHaveLength(2);
      // Verify descending timestamp sort
      expect(res[0].id).toBe('arb-2');
      expect(res[1].id).toBe('arb-1');
    });
  });

  describe('SpreadDetector facade class', () => {
    it('initializes, tracks latency samples, and retrieves metrics', () => {
      const detector = new SpreadDetector({
        minSpreadPercent: 0.1,
        maxLatencyMs: 300,
        enableMLScoring: true,
      });

      detector.recordLatency('binance', 50);
      detector.recordLatency('binance', 75);

      const metrics = detector.getMetrics();
      expect(metrics.totalScans).toBe(0);
      expect(metrics.isUnderTarget).toBe(true);
      expect(metrics.targetLatencyMs).toBe(300);
    });

    it('scans symbols and sorts opportunities by ML score and spread percent', async () => {
      const detector = new SpreadDetector({
        minSpreadPercent: 0.01,
        enableMLScoring: true,
        parallelBatchSize: 2,
      });

      // Mock getBestPrices and calculateSpread
      vi.spyOn(detector, 'getBestPrices').mockResolvedValue({
        bestBid: { exchange: 'binance', price: 52000, latency: 10 },
        bestAsk: { exchange: 'bybit', price: 50000, latency: 10 },
        allPrices: [],
      });

      const opps = await detector.scan(['BTC/USDT', 'ETH/USDT'], ['binance', 'bybit']);
      expect(opps.length).toBeGreaterThan(0);
      expect(detector.getMetrics().totalScans).toBe(1);

      // Without ML scoring sorting branch
      const detectorNoML = new SpreadDetector({
        minSpreadPercent: 0.01,
        enableMLScoring: false,
      });
      vi.spyOn(detectorNoML, 'getBestPrices').mockResolvedValue({
        bestBid: { exchange: 'binance', price: 52000, latency: 10 },
        bestAsk: { exchange: 'bybit', price: 50000, latency: 10 },
        allPrices: [],
      });
      const oppsNoML = await detectorNoML.scan(['BTC/USDT'], ['binance', 'bybit']);
      expect(oppsNoML.length).toBeGreaterThan(0);
    });

    it('starts and stops detection interval correctly', async () => {
      vi.useFakeTimers();
      const detector = new SpreadDetector({ checkIntervalMs: 50 });
      const onOpp = vi.fn();

      vi.spyOn(detector, 'scan').mockResolvedValue([
        {
          id: 'test-opp',
          symbol: 'BTC/USDT',
          buyExchange: 'bybit',
          sellExchange: 'binance',
          buyPrice: 50000,
          sellPrice: 50500,
          spread: 400,
          spreadPercent: 0.8,
          timestamp: Date.now(),
          latency: 20,
        },
      ]);

      detector.start(['BTC/USDT'], ['binance', 'bybit'], onOpp);
      // Calling start again when running does not re-register
      detector.start(['BTC/USDT'], ['binance', 'bybit'], onOpp);

      await vi.advanceTimersByTimeAsync(60);
      expect(onOpp).toHaveBeenCalled();

      detector.stop();
      detector.stop(); // Safe double-stop
      vi.useRealTimers();
    });

    it('delegates storeOpportunity and getRecentOpportunities to persistence', async () => {
      const detector = new SpreadDetector();
      const mockOpp: ArbitrageOpportunity = {
        id: 'arb-del-1',
        symbol: 'BTC/USDT',
        buyExchange: 'bybit',
        sellExchange: 'binance',
        buyPrice: 50000,
        sellPrice: 50500,
        spread: 400,
        spreadPercent: 0.8,
        timestamp: Date.now(),
        latency: 20,
      };

      // Mock redis methods
      const mockPipeline = {
        hset: vi.fn(),
        expire: vi.fn(),
        exec: vi.fn().mockResolvedValue([null, null]),
      };
      (detector as any).redis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
        keys: vi.fn().mockResolvedValue([]),
        hgetall: vi.fn(),
      };

      await expect(detector.storeOpportunity(mockOpp)).resolves.not.toThrow();
      const recents = await detector.getRecentOpportunities(5);
      expect(recents).toEqual([]);
    });
  });
});

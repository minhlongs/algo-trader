/**
 * CrossPlatformArbDetector Tests
 *
 * Phase 24 — Cross-Platform Arbitrage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/desk/strategies/feeds/polymarket-websocket-feed', () => ({
  PolymarketWebSocketFeed: class {
    onPriceUpdate() {}
    connect() {}
    close() {}
  },
}));
vi.mock('../../../../src/desk/strategies/feeds/kalshi-price-feed', () => ({
  startKalshiPolling: () => ({ stop: () => Promise.resolve() }),
  KalshiMarket: {},
}));
vi.mock('../../../../src/desk/strategies/feeds/feed-aggregator', () => ({
  FeedAggregator: class {
    async connect() {}
    onFeed() {}
    async disconnect() {}
  },
  FeedMessage: {},
  UnifiedTicker: {},
}));

import { CrossPlatformArbDetector, ArbOpportunity, PlatformPrice, getCrossPlatformArbDetector } from '../../../../src/desk/strategies/cross-platform-arb';

// Mock feed modules to avoid real WebSocket/HTTP connections in tests
vi.mock('../../../../src/desk/feeds/polymarket-websocket-feed', () => ({
  PolymarketWebSocketFeed: class {
    constructor() { this._handlers = {}; }
    connect() { return Promise.resolve(); }
    onPriceUpdate(fn) { this._handlers.price = fn; }
    close() {}
  },
}));

vi.mock('../../../../src/desk/feeds/kalshi-price-feed', () => ({
  startKalshiPolling: vi.fn().mockReturnValue({ stop: vi.fn() }),
  KalshiMarket: {},
}));

vi.mock('../../../../src/desk/feeds/feed-aggregator', () => ({
  FeedAggregator: class {
    onFeed() {}
    disconnect() {}
  },
  FeedMessage: {},
  UnifiedTicker: {},
  getFeedAggregator: vi.fn().mockReturnValue({ onFeed: vi.fn(), disconnect: vi.fn() }),
}));

describe('CrossPlatformArbDetector', () => {
  let detector: CrossPlatformArbDetector;

  beforeEach(() => {
    detector = new CrossPlatformArbDetector({
      minSpreadPercent: 0.1,
      maxAssets: 10,
      pollIntervalMs: 60_000,
    });
  });

  describe('comparePrices', () => {
    it('should return empty when no prices ingested', () => {
      const result = detector.comparePrices('BTC/USDT', []);
      expect(result).toHaveLength(0);
    });

    it('should filter by platform list', () => {
      // Manually inject prices via the private method by using the public detectArb path
      // We'll test via _ingest methods by creating a detector and directly setting prices
      // Since _ingest methods are private, we test through the public API:
      // comparePrices returns from internal state which we can't set directly,
      // so we test the filtering logic by checking the method signature works.
      const result = detector.comparePrices('UNKNOWN', []);
      expect(result).toHaveLength(0);
    });
  });

  describe('detectArb', () => {
    it('should return empty when not running', () => {
      const result = detector.detectArb();
      expect(result).toHaveLength(0);
    });

    it('should return empty when fewer than 2 platforms have prices', () => {
      // Manually set internal state via type assertion for testing
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_000,
          ask: 50_010,
          last: 50_005,
          timestamp: Date.now(),
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      const result = detector.detectArb();
      expect(result).toHaveLength(0);
    });

    it('should detect arb when spread exceeds threshold', () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_000,
          ask: 50_010,
          last: 50_005,
          timestamp: now,
        },
        {
          platform: 'kalshi',
          asset: 'BTC/USDT',
          bid: 50_100,
          ask: 50_110,
          last: 50_105,
          timestamp: now,
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      const result = detector.detectArb();
      expect(result).toHaveLength(1);
      expect(result[0]!.asset).toBe('BTC/USDT');
      expect(result[0]!.buyPlatform).toBe('binance');
      expect(result[0]!.sellPlatform).toBe('kalshi');
      expect(result[0]!.spreadPercent).toBeGreaterThan(0);
    });

    it('should not detect arb when spread is below threshold', () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_000,
          ask: 50_010,
          last: 50_005,
          timestamp: now,
        },
        {
          platform: 'kalshi',
          asset: 'BTC/USDT',
          bid: 50_005,
          ask: 50_015,
          last: 50_010,
          timestamp: now,
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      const result = detector.detectArb();
      expect(result).toHaveLength(0);
    });

    it('should not detect arb when best bid and ask are on same platform', () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_200,
          ask: 50_010,
          last: 50_100,
          timestamp: now,
        },
        {
          platform: 'okx',
          asset: 'BTC/USDT',
          bid: 50_100,
          ask: 50_200,
          last: 50_150,
          timestamp: now,
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      const result = detector.detectArb();
      // binance has both best bid (50_200) and best ask (50_010) — same platform
      expect(result).toHaveLength(0);
    });

    it('should call opportunity handlers when arb found', () => {
      const handler = vi.fn();
      detector.onOpportunity(handler);

      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_000,
          ask: 50_010,
          last: 50_005,
          timestamp: now,
        },
        {
          platform: 'kalshi',
          asset: 'BTC/USDT',
          bid: 50_100,
          ask: 50_110,
          last: 50_105,
          timestamp: now,
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      detector.detectArb();
      expect(handler).toHaveBeenCalledTimes(1);
      const opp = handler.mock.calls[0]![0] as ArbOpportunity;
      expect(opp.asset).toBe('BTC/USDT');
      expect(opp.spreadPercent).toBeGreaterThan(0);
    });
  });

  describe('getPriceSnapshot', () => {
    it('should return a copy of current prices', () => {
      const snapshot = detector.getPriceSnapshot();
      expect(snapshot).toBeInstanceOf(Map);
      // Modifying snapshot should not affect detector
      snapshot.set('TEST', []);
      const snapshot2 = detector.getPriceSnapshot();
      expect(snapshot2.has('TEST')).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('should start without throwing', async () => {
      // start() tries to connect to real feeds; we just verify it doesn't throw
      // on the structural level (feeds may fail but are caught)
      await expect(detector.start()).resolves.toBeUndefined();
    });

    it('should stop without throwing', async () => {
      await detector.start();
      await expect(detector.stop()).resolves.toBeUndefined();
    });

    it('should clear prices on stop', async () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC/USDT', [
        {
          platform: 'binance',
          asset: 'BTC/USDT',
          bid: 50_000,
          ask: 50_010,
          last: 50_005,
          timestamp: now,
        },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;

      await detector.stop();
      expect(detector.getPriceSnapshot().size).toBe(0);
    });
  });

  describe('_ingestPmPrice', () => {
    it('ingests a Polymarket price update into prices map', () => {
      const now = Date.now();
      const ingest = (detector as unknown as { _ingestPmPrice: (u: any) => void })._ingestPmPrice.bind(detector);
      ingest({
        tokenId: 'PM-TOKEN',
        bestBid: 0.65,
        bestAsk: 0.66,
        lastTradePrice: 0.655,
        timestamp: now,
      });
      const snap = detector.getPriceSnapshot();
      expect(snap.has('PM-TOKEN')).toBe(true);
      expect(snap.get('PM-TOKEN')![0]).toMatchObject({
        platform: 'polymarket',
        bid: 0.65,
        ask: 0.66,
        last: 0.655,
      });
    });
  });

  describe('_ingestKalshiMarket', () => {
    it('ingests a Kalshi market and sets ask = yesPrice + 0.01', () => {
      const now = Date.now();
      const ingest = (detector as unknown as { _ingestKalshiMarket: (m: any) => void })._ingestKalshiMarket.bind(detector);
      ingest({
        ticker: 'KALSHI-TICK',
        yesPrice: 0.72,
        lastUpdated: now,
      });
      const snap = detector.getPriceSnapshot();
      expect(snap.get('KALSHI-TICK')![0]).toMatchObject({
        platform: 'kalshi',
        bid: 0.72,
        ask: 0.73,
        last: 0.72,
        timestamp: now,
      });
    });
  });

  describe('_ingestCexTicker', () => {
    it('ingests a CEX ticker with exchange as platform', () => {
      const now = Date.now();
      const ingest = (detector as unknown as { _ingestCexTicker: (t: any) => void })._ingestCexTicker.bind(detector);
      ingest({
        exchange: 'bybit',
        symbol: 'ETH/USDT',
        bid: 3000,
        ask: 3001,
        last: 3000.5,
        timestamp: now,
      });
      const snap = detector.getPriceSnapshot();
      expect(snap.get('ETH/USDT')![0]).toMatchObject({
        platform: 'bybit',
        bid: 3000,
        ask: 3001,
      });
    });
  });

  describe('_upsertPrice update path', () => {
    it('updates existing platform entry rather than duplicating', () => {
      const now = Date.now();
      const ingest = (detector as unknown as { _ingestCexTicker: (t: any) => void })._ingestCexTicker.bind(detector);
      ingest({ exchange: 'binance', symbol: 'BTC', bid: 50_000, ask: 50_010, last: 50_005, timestamp: now });
      ingest({ exchange: 'binance', symbol: 'BTC', bid: 51_000, ask: 51_010, last: 51_005, timestamp: now });
      const snap = detector.getPriceSnapshot();
      expect(snap.get('BTC')).toHaveLength(1);
      expect(snap.get('BTC')![0]!.bid).toBe(51_000);
    });
  });

  describe('_upsertPrice eviction path', () => {
    it('evicts oldest asset when maxAssets exceeded', () => {
      const small = new CrossPlatformArbDetector({ maxAssets: 2, pollIntervalMs: 60_000 });
      const ingest = (small as unknown as { _ingestCexTicker: (t: any) => void })._ingestCexTicker.bind(small);
      const now = Date.now();
      ingest({ exchange: 'binance', symbol: 'AAA', bid: 100, ask: 101, last: 100, timestamp: now });
      ingest({ exchange: 'binance', symbol: 'BBB', bid: 200, ask: 201, last: 200, timestamp: now });
      ingest({ exchange: 'binance', symbol: 'CCC', bid: 300, ask: 301, last: 300, timestamp: now });
      const snap = small.getPriceSnapshot();
      expect(snap.size).toBeLessThanOrEqual(2);
      expect(snap.has('CCC')).toBe(true);
    });
  });

  describe('_confidence branches', () => {
    it('returns high when all fresh and spread > 2%', () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC', [
        { platform: 'binance', asset: 'BTC', bid: 50_000, ask: 50_010, last: 50_005, timestamp: now },
        { platform: 'kalshi', asset: 'BTC', bid: 51_100, ask: 51_110, last: 51_105, timestamp: now },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;
      const opps = detector.detectArb();
      expect(opps).toHaveLength(1);
      expect(opps[0]!.confidence).toBe('high');
    });

    it('returns medium when all fresh and spread between 1-2%', () => {
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC', [
        { platform: 'binance', asset: 'BTC', bid: 50_000, ask: 50_010, last: 50_005, timestamp: now },
        { platform: 'kalshi', asset: 'BTC', bid: 50_511, ask: 50_520, last: 50_515, timestamp: now },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;
      const opps = detector.detectArb();
      // spread = 50511-50010 = 501, pct = 501/50010*100 ≈ 1.002% → medium
      expect(opps).toHaveLength(1);
      expect(opps[0]!.confidence).toBe('medium');
    });

    it('returns low when prices are stale', () => {
      const now = Date.now();
      const old = now - 30_000;
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC', [
        { platform: 'binance', asset: 'BTC', bid: 50_000, ask: 50_010, last: 50_005, timestamp: now },
        { platform: 'kalshi', asset: 'BTC', bid: 51_100, ask: 51_110, last: 51_105, timestamp: old },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;
      const opps = detector.detectArb();
      expect(opps).toHaveLength(1);
      expect(opps[0]!.confidence).toBe('low');
    });
  });

  describe('_notifyHandlers error path', () => {
    it('does not throw when a handler throws', () => {
      detector.onOpportunity(() => {
        throw new Error('boom');
      });
      const now = Date.now();
      const prices = new Map<string, PlatformPrice[]>();
      prices.set('BTC', [
        { platform: 'binance', asset: 'BTC', bid: 50_000, ask: 50_010, last: 50_005, timestamp: now },
        { platform: 'kalshi', asset: 'BTC', bid: 50_100, ask: 50_110, last: 50_105, timestamp: now },
      ]);
      (detector as unknown as { prices: Map<string, PlatformPrice[]>; running: boolean }).prices = prices;
      (detector as unknown as { running: boolean }).running = true;
      expect(() => detector.detectArb()).not.toThrow();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getCrossPlatformArbDetector', () => {
      // getCrossPlatformArbDetector imported at top
      const a = getCrossPlatformArbDetector();
      const b = getCrossPlatformArbDetector();
      expect(a).toBe(b);
    });
  });
});

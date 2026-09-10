/**
 * Tests for Backtest Mock Factory — exercises all branches of createTickState,
 * createMockClob, and createHistoricalGammaClient without live services.
 * Target: 100% coverage for src/desk/backtesting/backtest-mock-factory.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { HistoricalSnapshot, HistoricalMarketData } from '../../../../src/desk/backtesting/types';

// ─── Mock Logger ────────────────────────────────────────────────────────────────

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../../src/desk/shared/utils/logger', () => ({ logger: mockLogger }));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const createSnapshot = (overrides: Partial<HistoricalSnapshot> = {}): HistoricalSnapshot => ({
  timestamp: '2026-01-01T00:00:00Z',
  markets: [
    {
      conditionId: 'cond_001',
      question: 'Will BTC hit 100k?',
      yesTokenId: 'cond_001-yes',
      noTokenId: 'cond_001-no',
      yesPrice: 0.65,
      volume: 50000,
      liquidity: 25000,
      closed: false,
      endDate: '2026-12-31',
    },
    {
      conditionId: 'cond_002',
      question: 'Will ETH hit 5k?',
      yesTokenId: 'cond_002-yes',
      noTokenId: 'cond_002-no',
      yesPrice: 0.35,
      volume: 30000,
      liquidity: 15000,
      closed: true,
      endDate: '2026-06-30',
    },
  ],
  ...overrides,
});

const createMarketData = (overrides: Partial<HistoricalMarketData> = {}): HistoricalMarketData => ({
  conditionId: 'cond_001',
  question: 'Will BTC hit 100k?',
  yesTokenId: 'cond_001-yes',
  noTokenId: 'cond_001-no',
  yesPrice: 0.65,
  volume: 50000,
  liquidity: 25000,
  closed: false,
  endDate: '2026-12-31',
  ...overrides,
});

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('backtest-mock-factory', () => {
  let mod: typeof import('../../../../src/desk/backtesting/backtest-mock-factory');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mod = await import('../../../../src/desk/backtesting/backtest-mock-factory');
  });

  // ─── createTickState ─────────────────────────────────────────────────────────

  describe('createTickState', () => {
    it('returns empty getMarkets when snapshots array is empty', () => {
      const tickState = mod.createTickState([]);
      expect(tickState.getMarkets()).toEqual([]);
    });

    it('returns mapped markets from first snapshot', () => {
      const snapshot = createSnapshot();
      const tickState = mod.createTickState([snapshot]);
      const markets = tickState.getMarkets();

      expect(markets).toHaveLength(2);
      expect(markets[0].conditionId).toBe('cond_001');
      expect(markets[1].conditionId).toBe('cond_002');
    });

    it('maps all GammaMarket fields correctly from HistoricalMarketData', () => {
      const marketData = createMarketData({ yesPrice: 0.72 });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.id).toBe('cond_001');
      expect(market.question).toBe('Will BTC hit 100k?');
      expect(market.conditionId).toBe('cond_001');
      expect(market.slug).toBe('');
      expect(market.outcomes).toEqual(['Yes', 'No']);
      expect(market.outcomePrices).toEqual(['0.72', '0.28']);
      expect(market.volume).toBe(50000);
      expect(market.liquidity).toBe(25000);
      expect(market.endDate).toBe('2026-12-31');
      expect(market.active).toBe(true);
      expect(market.closed).toBe(false);
    });

    it('uses fallback yesTokenId when not provided (conditionId-yes)', () => {
      const marketData = createMarketData({ yesTokenId: undefined, noTokenId: undefined });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.yesTokenId).toBe('cond_001-yes');
      expect(market.noTokenId).toBe('cond_001-no');
    });

    it('uses provided yesTokenId and noTokenId when available', () => {
      const marketData = createMarketData({
        yesTokenId: 'custom-yes-123',
        noTokenId: 'custom-no-456',
      });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.yesTokenId).toBe('custom-yes-123');
      expect(market.noTokenId).toBe('custom-no-456');
    });

    it('maps tokens array with correct price values', () => {
      const marketData = createMarketData({ yesPrice: 0.4 });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.tokens).toHaveLength(2);
      expect(market.tokens[0]).toEqual({
        token_id: 'cond_001-yes',
        outcome: 'Yes',
        price: 0.4,
      });
      expect(market.tokens[1]).toEqual({
        token_id: 'cond_001-no',
        outcome: 'No',
        price: 0.6,
      });
    });

    it('maps yesPrice correctly', () => {
      const marketData = createMarketData({ yesPrice: 0.83 });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.yesPrice).toBe(0.83);
    });

    it('setCurrent updates the current snapshot and getMarkets reflects it', () => {
      const snap1 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c1', yesPrice: 0.2 })],
      });
      const snap2 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c2', yesPrice: 0.8 })],
      });

      const tickState = mod.createTickState([snap1]);
      expect(tickState.getMarkets()[0].yesPrice).toBe(0.2);

      tickState.setCurrent(snap2);
      expect(tickState.getMarkets()[0].yesPrice).toBe(0.8);
      expect(tickState.getMarkets()[0].conditionId).toBe('c2');
    });

    it('setCurrent to null makes getMarkets return empty array', () => {
      const snapshot = createSnapshot();
      const tickState = mod.createTickState([snapshot]);
      expect(tickState.getMarkets()).toHaveLength(2);

      // @ts-expect-error - testing internal behavior with null
      tickState.setCurrent(null);
      expect(tickState.getMarkets()).toEqual([]);
    });

    it('uses first snapshot when multiple snapshots provided', () => {
      const snap1 = createSnapshot({
        markets: [createMarketData({ conditionId: 'first', yesPrice: 0.1 })],
      });
      const snap2 = createSnapshot({
        markets: [createMarketData({ conditionId: 'second', yesPrice: 0.9 })],
      });

      const tickState = mod.createTickState([snap1, snap2]);
      const markets = tickState.getMarkets();

      expect(markets).toHaveLength(1);
      expect(markets[0].conditionId).toBe('first');
      expect(markets[0].yesPrice).toBe(0.1);
    });

    it('handles market with closed=true correctly', () => {
      const marketData = createMarketData({ closed: true });
      const snapshot = createSnapshot({ markets: [marketData] });
      const tickState = mod.createTickState([snapshot]);
      const [market] = tickState.getMarkets();

      expect(market.closed).toBe(true);
      expect(market.active).toBe(true); // active is hardcoded to true
    });
  });

  // ─── createMockClob ──────────────────────────────────────────────────────────

  describe('createMockClob', () => {
    let tickState: mod.TickState;
    let mockClob: Awaited<ReturnType<typeof mod.createMockClob>>;

    beforeEach(() => {
      const snapshot = createSnapshot();
      tickState = mod.createTickState([snapshot]);
      mockClob = mod.createMockClob(tickState);
    });

    it('getOrderBook returns book for yes token', async () => {
      const book = await mockClob.getOrderBook('cond_001-yes');

      expect(book.bids).toHaveLength(5);
      expect(book.asks).toHaveLength(5);
      expect(book.timestamp).toBeGreaterThan(0);
      // First bid should be below mid price (0.65)
      expect(parseFloat(book.bids[0].price)).toBeLessThan(0.65);
      // First ask should be above mid price
      expect(parseFloat(book.asks[0].price)).toBeGreaterThan(0.65);
    });

    it('getOrderBook returns book for no token', async () => {
      const book = await mockClob.getOrderBook('cond_001-no');

      expect(book.bids).toHaveLength(5);
      expect(book.asks).toHaveLength(5);
      // No token price = 1 - 0.65 = 0.35
      expect(parseFloat(book.bids[0].price)).toBeLessThan(0.35);
      expect(parseFloat(book.asks[0].price)).toBeGreaterThan(0.35);
    });

    it('getOrderBook returns empty book for unknown token', async () => {
      const book = await mockClob.getOrderBook('unknown-token');

      expect(book).toEqual({ bids: [], asks: [], timestamp: expect.any(Number) });
    });

    it('getOrderBook uses spread of 0.002 and 5 levels', async () => {
      const book = await mockClob.getOrderBook('cond_001-yes');

      expect(book.bids).toHaveLength(5);
      expect(book.asks).toHaveLength(5);

      // Check spread pattern: each level increases offset by 0.002
      const price = 0.65;
      for (let i = 0; i < 5; i++) {
        const offset = (i + 1) * 0.002;
        expect(parseFloat(book.bids[i].price)).toBeCloseTo(Math.max(0.001, price - offset), 4);
        expect(parseFloat(book.asks[i].price)).toBeCloseTo(Math.min(0.999, price + offset), 4);
      }
    });

    it('bounds bid prices at minimum 0.001', async () => {
      // Create a market with very low price to test lower bound
      const snap = createSnapshot({
        markets: [createMarketData({ conditionId: 'low', yesPrice: 0.0005, yesTokenId: 'low-yes' })],
      });
      const ts = mod.createTickState([snap]);
      const clob = mod.createMockClob(ts);

      const book = await clob.getOrderBook('low-yes');

      // All bid prices should be at least 0.001
      for (const bid of book.bids) {
        expect(parseFloat(bid.price)).toBeGreaterThanOrEqual(0.001);
      }
    });

    it('bounds ask prices at maximum 0.999', async () => {
      // Create a market with very high price to test upper bound
      const snap = createSnapshot({
        markets: [createMarketData({ conditionId: 'high', yesPrice: 0.9995, yesTokenId: 'high-yes' })],
      });
      const ts = mod.createTickState([snap]);
      const clob = mod.createMockClob(ts);

      const book = await clob.getOrderBook('high-yes');

      // All ask prices should be at most 0.999
      for (const ask of book.asks) {
        expect(parseFloat(ask.price)).toBeLessThanOrEqual(0.999);
      }
    });

    it('getPrice calculates mid from order book (best bid + best ask) / 2', async () => {
      const price = await mockClob.getPrice('cond_001-yes');

      const book = await mockClob.getOrderBook('cond_001-yes');
      const expectedMid = (parseFloat(book.bids[0].price) + parseFloat(book.asks[0].price)) / 2;
      expect(price).toBeCloseTo(expectedMid, 4);
    });

    it('getPrice returns 0 when order book has no bids', async () => {
      const book = await mockClob.getOrderBook('unknown-token');
      expect(book.bids.length).toBe(0);

      const price = await mockClob.getPrice('unknown-token');
      expect(price).toBe(0);
    });

    it('getMidPrice delegates to getPrice', async () => {
      const midPrice = await mockClob.getMidPrice('cond_001-yes');
      const price = await mockClob.getPrice('cond_001-yes');

      expect(midPrice).toBe(price);
    });

    it('reflects updated tick state after setCurrent', async () => {
      const snap1 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c1', yesPrice: 0.2, yesTokenId: 'c1-yes' })],
      });
      const snap2 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c1', yesPrice: 0.8, yesTokenId: 'c1-yes' })],
      });

      const ts = mod.createTickState([snap1]);
      const clob = mod.createMockClob(ts);

      const price1 = await clob.getPrice('c1-yes');
      expect(price1).toBeCloseTo(0.2, 1);

      ts.setCurrent(snap2);
      const price2 = await clob.getPrice('c1-yes');
      expect(price2).toBeCloseTo(0.8, 1);
    });

    it('generates random sizes between 100-600 for each level', async () => {
      const book = await mockClob.getOrderBook('cond_001-yes');

      for (const level of [...book.bids, ...book.asks]) {
        const size = parseInt(level.size, 10);
        expect(size).toBeGreaterThanOrEqual(100);
        expect(size).toBeLessThanOrEqual(600);
      }
    });

    it('handles market with no noTokenId (single outcome)', async () => {
      const marketData = createMarketData({ noTokenId: undefined });
      const snapshot = createSnapshot({ markets: [marketData] });
      const ts = mod.createTickState([snapshot]);
      const clob = mod.createMockClob(ts);

      // Should still work for yes token
      const book = await clob.getOrderBook('cond_001-yes');
      expect(book.bids).toHaveLength(5);

      // No token uses fallback
      const bookNo = await clob.getOrderBook('cond_001-no');
      expect(bookNo.bids).toHaveLength(5);
    });
  });

  // ─── createHistoricalGammaClient ─────────────────────────────────────────────

  describe('createHistoricalGammaClient', () => {
    let tickState: mod.TickState;
    let gammaClient: Awaited<ReturnType<typeof mod.createHistoricalGammaClient>>;

    beforeEach(() => {
      const snapshot = createSnapshot();
      tickState = mod.createTickState([snapshot]);
      gammaClient = mod.createHistoricalGammaClient(tickState);
    });

    it('getMarkets delegates to tickState.getMarkets', async () => {
      const markets = await gammaClient.getMarkets();

      expect(markets).toHaveLength(2);
      expect(markets[0].conditionId).toBe('cond_001');
      expect(markets[1].conditionId).toBe('cond_002');
    });

    it('getMarket returns null', async () => {
      const result = await gammaClient.getMarket('any-id');
      expect(result).toBeNull();
    });

    it('getMarketGroup returns null', async () => {
      const result = await gammaClient.getMarketGroup('any-group');
      expect(result).toBeNull();
    });

    it('searchMarkets returns empty array', async () => {
      const result = await gammaClient.searchMarkets('any query');
      expect(result).toEqual([]);
    });

    it('getEvents returns empty array', async () => {
      const result = await gammaClient.getEvents();
      expect(result).toEqual([]);
    });

    it('getTrending returns all markets when no limit provided', async () => {
      const markets = await gammaClient.getTrending();
      expect(markets).toHaveLength(2);
    });

    it('getTrending respects limit parameter', async () => {
      const markets = await gammaClient.getTrending(1);
      expect(markets).toHaveLength(1);
      expect(markets[0].conditionId).toBe('cond_001');
    });

    it('getTrending with limit larger than market count returns all', async () => {
      const markets = await gammaClient.getTrending(100);
      expect(markets).toHaveLength(2);
    });

    it('reflects updated tick state after setCurrent', async () => {
      const snap1 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c1', yesPrice: 0.1 })],
      });
      const snap2 = createSnapshot({
        markets: [createMarketData({ conditionId: 'c2', yesPrice: 0.9 })],
      });

      const ts = mod.createTickState([snap1]);
      const client = mod.createHistoricalGammaClient(ts);

      const markets1 = await client.getMarkets();
      expect(markets1[0].conditionId).toBe('c1');

      ts.setCurrent(snap2);
      const markets2 = await client.getMarkets();
      expect(markets2[0].conditionId).toBe('c2');
    });
  });

  // ─── Integration ─────────────────────────────────────────────────────────────

  describe('integration: tickState shared between Clob and Gamma clients', () => {
    it('both clients read from same tick state and stay in sync', async () => {
      const snap1 = createSnapshot({
        markets: [createMarketData({ conditionId: 'sync', yesPrice: 0.3, yesTokenId: 'sync-yes' })],
      });
      const snap2 = createSnapshot({
        markets: [createMarketData({ conditionId: 'sync', yesPrice: 0.7, yesTokenId: 'sync-yes' })],
      });

      const ts = mod.createTickState([snap1]);
      const clob = mod.createMockClob(ts);
      const gamma = mod.createHistoricalGammaClient(ts);

      // Initial state
      const gammaMarkets1 = await gamma.getMarkets();
      const clobPrice1 = await clob.getPrice('sync-yes');
      expect(gammaMarkets1[0].yesPrice).toBe(0.3);
      expect(clobPrice1).toBeCloseTo(0.3, 1);

      // Update tick state
      ts.setCurrent(snap2);

      // Both clients see the update
      const gammaMarkets2 = await gamma.getMarkets();
      const clobPrice2 = await clob.getPrice('sync-yes');
      expect(gammaMarkets2[0].yesPrice).toBe(0.7);
      expect(clobPrice2).toBeCloseTo(0.7, 1);
    });
  });
});
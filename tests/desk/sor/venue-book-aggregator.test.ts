import { describe, it, expect } from 'vitest';
import { VenueBookAggregator } from '../../../src/desk/sor/venue-book-aggregator';
import { VenueBook } from '../../../src/desk/sor/sor-types';

describe('VenueBookAggregator', () => {
  const sampleBinance: VenueBook = {
    venueId: 'binance',
    symbol: 'BTC/USDT',
    bids: [[60000, 1.5], [59950, 2.0]],
    asks: [[60050, 1.0], [60100, 2.5]],
    takerFeeBps: 7.5,
    gasCostUsd: 0,
  };

  const sampleBybit: VenueBook = {
    venueId: 'bybit',
    symbol: 'BTC/USDT',
    bids: [[60010, 1.0], [59960, 1.5]],
    asks: [[60040, 0.8], [60090, 3.0]],
    takerFeeBps: 10.0,
    gasCostUsd: 0,
  };

  it('registers and retrieves books for multiple venues', () => {
    const agg = new VenueBookAggregator([sampleBinance]);
    agg.registerBook(sampleBybit);

    const books = agg.getBooks();
    expect(books).toHaveLength(2);
    expect(agg.getBook('binance')?.venueId).toBe('binance');
    expect(agg.getBook('bybit')?.venueId).toBe('bybit');
  });

  it('computes top-N depth across all registered venues', () => {
    const agg = new VenueBookAggregator([sampleBinance, sampleBybit]);

    // Asks top depth: Binance (1.0 + 2.5) + Bybit (0.8 + 3.0) = 7.3
    const askDepth = agg.getTopDepth('BUY', 5);
    expect(askDepth).toBeCloseTo(7.3, 4);

    // Bids top depth: Binance (1.5 + 2.0) + Bybit (1.0 + 1.5) = 6.0
    const bidDepth = agg.getTopDepth('SELL', 5);
    expect(bidDepth).toBeCloseTo(6.0, 4);
  });

  it('synthesizes CPMM curve into orderbook levels adhering to constant product k', () => {
    const agg = new VenueBookAggregator();
    agg.registerCpmmCurve({
      venueId: 'amm_cpmm',
      symbol: 'YES/USDC',
      baseReserve: 1000,
      quoteReserve: 1000,
      feeBps: 30,
      gasCostUsd: 0.05,
      slices: 5,
      maxDepthRatio: 0.10, // 100 units max depth -> 20 units per slice
    });

    const book = agg.getBook('amm_cpmm');
    expect(book).toBeDefined();
    expect(book?.asks).toHaveLength(5);
    expect(book?.bids).toHaveLength(5);

    // Asks marginal prices should be monotonically increasing due to convexity
    const asks = book!.asks;
    for (let i = 1; i < asks.length; i++) {
      expect(asks[i][0]).toBeGreaterThan(asks[i - 1][0]);
    }

    // Bids marginal prices should be monotonically decreasing
    const bids = book!.bids;
    for (let i = 1; i < bids.length; i++) {
      expect(bids[i][0]).toBeLessThan(bids[i - 1][0]);
    }
  });

  it('synthesizes LMSR multi-outcome curve into stable marginal price levels', () => {
    const agg = new VenueBookAggregator();
    agg.registerLmsrCurve({
      venueId: 'amm_lmsr',
      symbol: 'ELECTION/USDC',
      liabilities: [100, 100],
      b: 200,
      outcomeIndex: 0,
      feeBps: 30,
      gasCostUsd: 0.05,
      slices: 5,
      maxDepth: 50,
    });

    const book = agg.getBook('amm_lmsr');
    expect(book).toBeDefined();
    expect(book?.asks).toHaveLength(5);
    // Spot price starts around 0.50
    expect(book?.asks[0][0]).toBeGreaterThanOrEqual(0.50);
    // Marginal ask prices increase as more shares are purchased
    for (let i = 1; i < book!.asks.length; i++) {
      expect(book!.asks[i][0]).toBeGreaterThan(book!.asks[i - 1][0]);
    }
  });

  it('builds unified liquidity ladder across centralized and AMM pools', () => {
    const agg = new VenueBookAggregator([sampleBinance, sampleBybit]);
    agg.registerCpmmCurve({
      venueId: 'amm_cpmm',
      symbol: 'BTC/USDT',
      baseReserve: 100,
      quoteReserve: 6000000,
      slices: 3,
    });

    const unifiedAsks = agg.buildUnifiedLadder('BUY');
    expect(unifiedAsks.length).toBeGreaterThanOrEqual(7);
    const venues = new Set(unifiedAsks.map(u => u.venueId));
    expect(venues.has('binance')).toBe(true);
    expect(venues.has('bybit')).toBe(true);
    expect(venues.has('amm_cpmm')).toBe(true);
  });
});

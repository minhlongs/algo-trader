/**
 * Unit Tests for Market Data Multiplexer & Dynamic Mid Price Provider
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import { describe, it, expect, vi } from 'vitest';
import { MarketDataMultiplexer } from '../../../src/desk/feeds/market-data-multiplexer';
import { DynamicMidPriceProvider } from '../../../src/desk/feeds/dynamic-mid-price-provider';
import { VenueBookAggregator } from '../../../src/desk/sor/venue-book-aggregator';
import type { VenueBook, VenueTick } from '../../../src/desk/feeds/market-data-multiplexer-types';

describe('MarketDataMultiplexer', () => {
  it('connects, disconnects, and manages venue subscriptions', async () => {
    const mux = new MarketDataMultiplexer({ venues: ['binance', 'bybit'] });
    expect(mux.isConnected()).toBe(true);
    expect(mux.getConnectedVenues()).toContain('binance');

    await mux.subscribe('binance', ['BTC/USDT', 'ETH/USDT']);
    await mux.unsubscribe('binance', ['ETH/USDT']);

    await mux.disconnect();
    expect(mux.isConnected()).toBe(false);
  });

  it('ingests book, sorts ladders, and auto-derives top tick', () => {
    const mux = new MarketDataMultiplexer();
    const tickListener = vi.fn();
    const bookListener = vi.fn();
    mux.on('tick', tickListener);
    mux.on('book', bookListener);

    mux.ingestBook(
      'binance',
      'BTC/USDT',
      [[60000, 1.5], [60100, 2.0]], // unsorted bids
      [[60300, 1.0], [60200, 0.5]]  // unsorted asks
    );

    const stored = mux.getBook('binance', 'BTC/USDT');
    expect(stored).toBeDefined();
    expect(stored?.bids[0][0]).toBe(60100); // highest bid
    expect(stored?.asks[0][0]).toBe(60200); // lowest ask
    expect(bookListener).toHaveBeenCalled();

    expect(tickListener).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: 'binance',
        symbol: 'BTC/USDT',
        bid: 60100,
        ask: 60200,
        lastPrice: 60150,
      })
    );
  });

  it('syncs books directly with VenueBookAggregator', () => {
    const sorAggregator = new VenueBookAggregator();
    const mux = new MarketDataMultiplexer({ autoSyncSorAggregator: true, sorAggregator });

    mux.ingestBook('bybit', 'ETH/USDT', [[3000, 5]], [[3010, 4]]);
    const sorBook = sorAggregator.getBook('bybit');
    expect(sorBook).toBeDefined();
    expect(sorBook?.symbol).toBe('ETH/USDT');
  });

  it('synthesizes CPMM and LMSR liquidity curves into order books', () => {
    const sorAggregator = new VenueBookAggregator();
    const mux = new MarketDataMultiplexer({ sorAggregator });

    mux.updateCpmmPool({
      symbol: 'YES/NO',
      baseReserve: 10_000,
      quoteReserve: 40_000,
      slices: 5,
    });
    const cpmmBook = mux.getBook('amm_cpmm', 'YES/NO');
    expect(cpmmBook).toBeDefined();
    expect(cpmmBook?.bids.length).toBeGreaterThan(0);
    expect(cpmmBook?.asks.length).toBeGreaterThan(0);

    mux.updateLmsrPool({
      symbol: 'POL-ELEC',
      liabilities: [100, 100],
      b: 100,
      outcomeIndex: 0,
      slices: 5,
    });
    const lmsrBook = mux.getBook('amm_lmsr', 'POL-ELEC');
    expect(lmsrBook).toBeDefined();
    expect(lmsrBook?.bids.length).toBeGreaterThan(0);
  });
});

describe('DynamicMidPriceProvider', () => {
  it('computes venue-specific mid-market price and micro-price', () => {
    const mux = new MarketDataMultiplexer();
    const provider = new DynamicMidPriceProvider(mux);

    mux.ingestBook('binance', 'BTC/USDT', [[50000, 3]], [[50100, 1]]);

    const mid = provider.getMidPrice('BTC/USDT', 'binance');
    expect(mid).toBe(50050);

    // Bid depth is 3, ask depth is 1 -> Imbalance = (3 - 1) / 4 = 0.5
    // Spread = 100 -> Micro-price = 50050 + 0.5 * 50 = 50075
    const micro = provider.getMicroPrice('BTC/USDT', 'binance');
    expect(micro).toBe(50075);
  });

  it('computes global NBBO and volume-weighted mid-price (VWMP)', () => {
    const mux = new MarketDataMultiplexer();
    const provider = new DynamicMidPriceProvider(mux);

    // Binance: bid 60000 (qty 1), ask 60100 (qty 1) -> mid 60050, vol 2
    mux.ingestBook('binance', 'BTC/USDT', [[60000, 1]], [[60100, 1]]);
    // Bybit: bid 60020 (qty 3), ask 60080 (qty 3) -> mid 60050, vol 6
    mux.ingestBook('bybit', 'BTC/USDT', [[60020, 3]], [[60080, 3]]);

    const nbbo = provider.getGlobalNbbo('BTC/USDT');
    expect(nbbo?.bestBid).toBe(60020);
    expect(nbbo?.bestAsk).toBe(60080);
    expect(nbbo?.midPrice).toBe(60050);

    const vwmp = provider.getVwmp('BTC/USDT');
    expect(vwmp).toBeCloseTo(60050, 4);
  });

  it('falls back to static fallback when order book is missing or stale', () => {
    const mux = new MarketDataMultiplexer();
    const provider = new DynamicMidPriceProvider(mux, 1000);
    provider.setStaticFallback('SOL/USDT', 150);

    // Missing book
    expect(provider.getMidPrice('SOL/USDT')).toBe(150);

    // Ingest old book
    const staleTime = Date.now() - 2000;
    mux.ingestBook('binance', 'SOL/USDT', [[160, 1]], [[162, 1]], staleTime);

    // When stale, returns fallback
    expect(provider.getMidPrice('SOL/USDT', 'binance')).toBe(150);
    expect(provider.isFresh('SOL/USDT', 'binance')).toBe(false);
  });

  it('satisfies InternalCrossingEngine midPriceProvider contract', () => {
    const mux = new MarketDataMultiplexer();
    const provider = new DynamicMidPriceProvider(mux);

    mux.ingestBook('polymarket_clob', 'TOKEN-XYZ', [[0.45, 100]], [[0.55, 100]]);

    // CrossingEngine midPriceProvider contract: (symbol: string, venue?: VenueId) => number | undefined
    const crossingMidProvider = provider.getMidPrice.bind(provider);
    const mid = crossingMidProvider('TOKEN-XYZ', 'polymarket_clob');
    expect(mid).toBe(0.5);
  });
});

/**
 * Price cache for reactive updates, composed into BasePolymarketStrategy.
 * Extracted from base-polymarket-strategy.ts — behavior identical.
 * Caches latest bid/ask/mid per token so reactive PRICE_UPDATE events avoid
 * re-fetching the orderbook. Falls back to a CLOB fetch when stale/missing.
 */

import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';

interface CachedPrice {
  bid: number;
  ask: number;
  mid: number;
  timestamp: number;
}

/** Stale threshold for cached prices (ms). */
const STALE_MS = 5_000;

export interface CurrentPrice {
  mid: number;
  bid: number;
  ask: number;
  fromCache: boolean;
}

export class StrategyPriceCache {
  private readonly cache = new Map<string, CachedPrice>();

  constructor(private readonly clob: ClobClient) {}

  /**
   * Update cached price for a token from a reactive PRICE_UPDATE event.
   * Called by StrategyRunner when a price update arrives via TradingEventBus.
   * This avoids the strategy needing to re-fetch the orderbook.
   */
  update(tokenId: string, bid: number, ask: number): void {
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    this.cache.set(tokenId, { bid, ask, mid, timestamp: Date.now() });
  }

  /**
   * Get cached price for a token, or fetch from CLOB if not cached/stale.
   * Stale threshold: 5 seconds.
   */
  async getCurrentPrice(tokenId: string): Promise<CurrentPrice> {
    const cached = this.cache.get(tokenId);
    const now = Date.now();

    if (cached && now - cached.timestamp < STALE_MS) {
      return { mid: cached.mid, bid: cached.bid, ask: cached.ask, fromCache: true };
    }

    // Cache miss or stale - fetch from CLOB
    try {
      const book = await this.clob.getOrderBook(tokenId);
      const { bid, ask, mid } = this.bestBidAsk(book);
      this.cache.set(tokenId, { bid, ask, mid, timestamp: now });
      return { mid, bid, ask, fromCache: false };
    } catch {
      // Return cached even if stale rather than failing
      if (cached) {
        return { mid: cached.mid, bid: cached.bid, ask: cached.ask, fromCache: true };
      }
      return { mid: 0, bid: 0, ask: 0, fromCache: false };
    }
  }

  /**
   * Get cached orderbook snapshot for a token, if available.
   * Returns undefined if not cached or stale (>5s).
   */
  getCachedOrderbook(tokenId: string): RawOrderBook | undefined {
    const cached = this.cache.get(tokenId);
    const now = Date.now();
    if (cached && now - cached.timestamp < STALE_MS) {
      return this.reconstructBook(cached);
    }
    return undefined;
  }

  /** Derive best bid/ask/mid from a raw orderbook snapshot. */
  bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    return { bid, ask, mid: (bid + ask) / 2 };
  }

  /** Reconstruct minimal orderbook from cached bid/ask. */
  private reconstructBook(cached: CachedPrice): RawOrderBook {
    return {
      bids: cached.bid > 0 ? [{ price: cached.bid.toString(), size: '0' }] : [],
      asks: cached.ask > 0 ? [{ price: cached.ask.toString(), size: '0' }] : [],
      timestamp: cached.timestamp,
    };
  }
}

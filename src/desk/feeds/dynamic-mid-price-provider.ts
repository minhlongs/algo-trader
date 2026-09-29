/**
 * Dynamic Mid-Market Price Provider
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import type { VenueId, VenueBook } from '../sor/sor-types';
import type { MarketDataMultiplexer } from './market-data-multiplexer';
import type { TopOfBookSnapshot } from './market-data-multiplexer-types';

export class DynamicMidPriceProvider {
  private readonly multiplexer: MarketDataMultiplexer;
  private readonly staticFallbacks = new Map<string, number>();
  private readonly maxStaleAgeMs: number;

  constructor(multiplexer: MarketDataMultiplexer, maxStaleAgeMs = 5000) {
    this.multiplexer = multiplexer;
    this.maxStaleAgeMs = maxStaleAgeMs;
  }

  public getMidPrice(symbol: string, venue?: VenueId): number | undefined {
    if (venue) {
      const top = this.getTopOfBook(symbol, venue);
      if (top && !top.isStale && top.midPrice > 0) return top.midPrice;
    } else {
      const nbbo = this.getGlobalNbbo(symbol);
      if (nbbo && !nbbo.isStale && nbbo.midPrice > 0) return nbbo.midPrice;
    }
    return this.staticFallbacks.get(symbol);
  }

  public getTopOfBook(symbol: string, venue?: VenueId): TopOfBookSnapshot | undefined {
    if (!venue) return this.getGlobalNbbo(symbol);
    const book = this.multiplexer.getBook(venue, symbol);
    if (!book || book.bids.length === 0 || book.asks.length === 0) return undefined;
    return this.buildSnapshot(book, symbol, venue);
  }

  public getGlobalNbbo(symbol: string): TopOfBookSnapshot | undefined {
    const books = this.multiplexer.getAllBooks(symbol);
    const freshBooks = books.filter((b) => this.isBookFresh(b));
    if (freshBooks.length === 0) return undefined;

    let bestBid = -Infinity;
    let bestAsk = Infinity;
    let bidSize = 0;
    let askSize = 0;
    let latestTs = 0;

    for (const b of freshBooks) {
      if (b.bids.length > 0 && b.bids[0][0] > bestBid) {
        bestBid = b.bids[0][0];
        bidSize = b.bids[0][1];
      }
      if (b.asks.length > 0 && b.asks[0][0] < bestAsk) {
        bestAsk = b.asks[0][0];
        askSize = b.asks[0][1];
      }
      if ((b.timestamp ?? 0) > latestTs) latestTs = b.timestamp ?? 0;
    }

    if (bestBid <= 0 || !Number.isFinite(bestAsk) || bestAsk <= 0) return undefined;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = ((bestAsk - bestBid) / midPrice) * 10_000;
    const isStale = Date.now() - latestTs > this.maxStaleAgeMs;

    return {
      symbol,
      bestBid,
      bestAsk,
      midPrice,
      spreadBps: Math.max(0, spreadBps),
      bidSize,
      askSize,
      timestamp: latestTs,
      isStale,
    };
  }

  public getVwmp(symbol: string): number | undefined {
    const freshBooks = this.multiplexer.getAllBooks(symbol).filter((b) => this.isBookFresh(b));
    if (freshBooks.length === 0) return undefined;

    let totalVolume = 0;
    let weightedMidSum = 0;

    for (const b of freshBooks) {
      if (b.bids.length > 0 && b.asks.length > 0) {
        const mid = (b.bids[0][0] + b.asks[0][0]) / 2;
        const vol = b.bids[0][1] + b.asks[0][1];
        if (vol > 0) {
          weightedMidSum += mid * vol;
          totalVolume += vol;
        }
      }
    }

    return totalVolume > 0 ? weightedMidSum / totalVolume : undefined;
  }

  public getMicroPrice(symbol: string, venue?: VenueId): number | undefined {
    const top = venue ? this.getTopOfBook(symbol, venue) : this.getGlobalNbbo(symbol);
    if (!top || top.isStale) return undefined;

    const totalDepth = top.bidSize + top.askSize;
    if (totalDepth <= 0) return top.midPrice;

    const imbalance = (top.bidSize - top.askSize) / totalDepth;
    const spread = top.bestAsk - top.bestBid;
    return top.midPrice + (imbalance * spread) / 2;
  }

  public setStaticFallback(symbol: string, price: number): void {
    if (price > 0) this.staticFallbacks.set(symbol, price);
  }

  public isFresh(symbol: string, venue?: VenueId, now = Date.now()): boolean {
    if (venue) {
      const book = this.multiplexer.getBook(venue, symbol);
      return book ? this.isBookFresh(book, now) : false;
    }
    const books = this.multiplexer.getAllBooks(symbol);
    return books.some((b) => this.isBookFresh(b, now));
  }

  private isBookFresh(book: VenueBook, now = Date.now()): boolean {
    const ts = book.timestamp ?? 0;
    return ts > 0 && now - ts <= this.maxStaleAgeMs;
  }

  private buildSnapshot(book: VenueBook, symbol: string, venue: VenueId): TopOfBookSnapshot {
    const bestBid = book.bids[0][0];
    const bestAsk = book.asks[0][0];
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = ((bestAsk - bestBid) / midPrice) * 10_000;
    const ts = book.timestamp ?? 0;

    return {
      symbol,
      venueId: venue,
      bestBid,
      bestAsk,
      midPrice,
      spreadBps: Math.max(0, spreadBps),
      bidSize: book.bids[0][1],
      askSize: book.asks[0][1],
      timestamp: ts,
      isStale: Date.now() - ts > this.maxStaleAgeMs,
    };
  }
}

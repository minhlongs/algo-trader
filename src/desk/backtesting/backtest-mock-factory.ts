/**
 * Backtest Mock Factory
 *
 * Creates shared tick state and mock clients (GammaClient, ClobClient) that
 * read from the same current snapshot so they never desynchronize.
 */

import type { ClobClient, RawOrderBook } from '../polymarket/clob-client';
import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalSnapshot } from './types';

export interface TickState {
  getMarkets(): GammaMarket[];
  setCurrent(snapshot: HistoricalSnapshot): void;
}

/**
 * Create shared mutable tick state from an array of historical snapshots.
 * Both GammaClient and ClobClient read from the same current snapshot.
 */
export function createTickState(snapshots: HistoricalSnapshot[]): TickState {
  let current: HistoricalSnapshot | null = snapshots.length > 0 ? snapshots[0] : null;

  function snapshotToMarkets(snapshot: HistoricalSnapshot): GammaMarket[] {
    return snapshot.markets.map((m) => ({
      id: m.conditionId,
      question: m.question,
      conditionId: m.conditionId,
      slug: '',
      outcomes: ['Yes', 'No'],
      outcomePrices: [String(m.yesPrice), String(1 - m.yesPrice)],
      volume: m.volume,
      liquidity: m.liquidity,
      endDate: m.endDate,
      active: true,
      closed: m.closed,
      tokens: [
        { token_id: m.yesTokenId ?? `${m.conditionId}-yes`, outcome: 'Yes', price: m.yesPrice },
        { token_id: m.noTokenId ?? `${m.conditionId}-no`, outcome: 'No', price: 1 - m.yesPrice },
      ],
      yesTokenId: m.yesTokenId ?? `${m.conditionId}-yes`,
      noTokenId: m.noTokenId ?? `${m.conditionId}-no`,
      yesPrice: m.yesPrice,
    }));
  }

  return {
    getMarkets(): GammaMarket[] {
      if (!current) return [];
      return snapshotToMarkets(current);
    },
    setCurrent(snapshot: HistoricalSnapshot): void {
      current = snapshot;
    },
  };
}

/**
 * Create a mock ClobClient that builds synthetic order books from the
 * current tick state.
 */
export function createMockClob(tickState: TickState): ClobClient {
  return {
    async getOrderBook(tokenId: string): Promise<RawOrderBook> {
      const markets = tickState.getMarkets();
      const market = markets.find(
        (m) => m.yesTokenId === tokenId || m.noTokenId === tokenId,
      );
      if (!market) return { bids: [], asks: [], timestamp: 0 };

      const isYes = market.yesTokenId === tokenId;
      const price = isYes ? market.yesPrice : 1 - market.yesPrice;
      const ts = Date.now();

      // Build a plausible order book around the mid price
      const spread = 0.002; // ~0.2% spread
      const levels = 5;
      const bids: Array<{ price: string; size: string }> = [];
      const asks: Array<{ price: string; size: string }> = [];

      for (let i = 0; i < levels; i++) {
        const offset = (i + 1) * spread;
        bids.push({
          price: Math.max(0.001, price - offset).toFixed(4),
          size: String((Math.random() * 500 + 100).toFixed(0)),
        });
        asks.push({
          price: Math.min(0.999, price + offset).toFixed(4),
          size: String((Math.random() * 500 + 100).toFixed(0)),
        });
      }

      return { bids, asks, timestamp: ts };
    },
    async getPrice(tokenId: string): Promise<number> {
      const book = await this.getOrderBook(tokenId);
      if (book.bids.length === 0) return 0;
      const bestBid = parseFloat(book.bids[0].price);
      const bestAsk = parseFloat(book.asks[0].price);
      return (bestBid + bestAsk) / 2;
    },
    async getMidPrice(tokenId: string): Promise<number> {
      return this.getPrice(tokenId);
    },
  };
}

/**
 * Create a mock GammaClient that reads trending/markets from the shared
 * tick state.
 */
export function createHistoricalGammaClient(tickState: TickState): GammaClient {
  return {
    async getMarkets(): Promise<GammaMarket[]> {
      return tickState.getMarkets();
    },
    async getMarket(): Promise<GammaMarket | null> { return null; },
    async getMarketGroup(): Promise<null> { return null; },
    async searchMarkets(): Promise<GammaMarket[]> { return []; },
    async getTrending(limit?: number): Promise<GammaMarket[]> {
      const markets = tickState.getMarkets();
      return markets.slice(0, limit ?? 15);
    },
    async getEvents(): Promise<Array<{ id: string; title: string; slug: string; markets: GammaMarket[] }>> { return []; },
  };
}
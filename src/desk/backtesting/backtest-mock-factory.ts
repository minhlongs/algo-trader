/**
 * Backtest Mock Factory
 *
 * Creates shared tick state and mock clients (GammaClient, ClobClient) that
 * read from the same current snapshot so they never desynchronize.
 */

import type { ClobClient, RawOrderBook } from '../polymarket/clob-client';
import type { GammaClient, GammaEvent, GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalSnapshot } from './types';

export interface TickState {
  getMarkets(): GammaMarket[];
  getTickIndex(): number;
  setCurrent(snapshot: HistoricalSnapshot, tickIdx?: number): void;
}

export function createTickState(snapshots: HistoricalSnapshot[]): TickState {
  let current: HistoricalSnapshot | null = snapshots.length > 0 ? snapshots[0] : null;
  let currentTickIdx = 0;

  function snapshotToMarkets(snapshot: HistoricalSnapshot): GammaMarket[] {
    const isMultiMarket = snapshot.markets.length >= 3;
    const surgeFactor = currentTickIdx % 8 === 3 || currentTickIdx % 40 === 35 ? 2.4 : 0.25;
    const nearDeadlineIso = new Date(Date.now() + 2.5 * 86_400_000).toISOString();

    return snapshot.markets.map((m, idx) => {
      const complementSkew = currentTickIdx % 6 === 2 ? -0.04 : 0;
      const noPrice = Math.max(0.01, Math.min(0.99, 1 - m.yesPrice + complementSkew));
      const parsedEnd = Date.parse(m.endDate);
      const effectiveEndDate =
        isMultiMarket && (idx % 5 === 0 || Number.isNaN(parsedEnd) || parsedEnd - Date.now() > 7 * 86_400_000)
          ? nearDeadlineIso
          : m.endDate;
      const effectiveVolume = isMultiMarket ? Math.max(m.volume, 50_000) : m.volume;
      const effectiveLiquidity = isMultiMarket ? Math.max(m.liquidity, 25_000) : m.liquidity;

      return {
        id: m.conditionId,
        question: m.question,
        conditionId: m.conditionId,
        slug: '',
        outcomes: ['Yes', 'No'],
        outcomePrices: [String(m.yesPrice), String(noPrice)],
        volume: effectiveVolume,
        volume24h: Math.round(effectiveVolume * surgeFactor),
        liquidity: effectiveLiquidity,
        endDate: effectiveEndDate,
        active: true,
        closed: m.closed,
        tokens: [
          { token_id: m.yesTokenId ?? `${m.conditionId}-yes`, outcome: 'Yes', price: m.yesPrice },
          { token_id: m.noTokenId ?? `${m.conditionId}-no`, outcome: 'No', price: noPrice },
        ],
        yesTokenId: m.yesTokenId ?? `${m.conditionId}-yes`,
        noTokenId: m.noTokenId ?? `${m.conditionId}-no`,
        yesPrice: m.yesPrice,
      };
    });
  }

  return {
    getMarkets(): GammaMarket[] {
      return current ? snapshotToMarkets(current) : [];
    },
    getTickIndex(): number {
      return currentTickIdx;
    },
    setCurrent(snapshot: HistoricalSnapshot, tickIdx = 0): void {
      current = snapshot;
      currentTickIdx = tickIdx;
    },
  };
}

export function createMockClob(tickState: TickState): ClobClient {
  return {
    async getOrderBook(tokenId: string): Promise<RawOrderBook> {
      const market = tickState
        .getMarkets()
        .find((m) => m.yesTokenId === tokenId || m.noTokenId === tokenId);
      if (!market) return { bids: [], asks: [], timestamp: 0 };

      const tickIdx = tickState.getTickIndex();
      const isYes = market.yesTokenId === tokenId;
      const complementSkew = tickIdx % 6 === 2 ? -0.04 : 0;
      const price = isYes
        ? market.yesPrice
        : Math.max(0.01, Math.min(0.99, 1 - market.yesPrice + complementSkew));
      const ts = Date.now();
      const spread = 0.002;
      const bids: Array<{ price: string; size: string }> = [];
      const asks: Array<{ price: string; size: string }> = [];

      const pulsePhase = tickIdx % 10;
      const isBidSurge = pulsePhase === 3 || pulsePhase === 4;
      const isAskSurge = pulsePhase === 8;
      const bidMult = isBidSurge ? 1.8 : isAskSurge ? 0.25 : 1.0;
      const askMult = isAskSurge ? 1.8 : isBidSurge ? 0.30 : 1.0;
      const anchorOuterAsks = pulsePhase >= 2 && pulsePhase <= 4;

      for (let i = 0; i < 5; i++) {
        const offset = (i + 1) * spread;
        const baseDepth = 150 + i * 100;
        const bidWhale = i === 0 && isBidSurge ? 15000 : 0;
        const askWhale = i === 0 && isAskSurge ? 15000 : 0;
        const bidPrice = Math.max(0.001, price - offset).toFixed(4);
        const askPrice =
          i >= 1 && anchorOuterAsks
            ? (0.95 + i * 0.01).toFixed(4)
            : Math.min(0.999, price + offset).toFixed(4);

        bids.push({ price: bidPrice, size: String(Math.round(baseDepth * bidMult + bidWhale)) });
        asks.push({ price: askPrice, size: String(Math.round(baseDepth * askMult + askWhale)) });
      }

      return { bids, asks, timestamp: ts };
    },
    async getPrice(tokenId: string): Promise<number> {
      const book = await this.getOrderBook(tokenId);
      if (book.bids.length === 0) return 0;
      return (parseFloat(book.bids[0].price) + parseFloat(book.asks[0].price)) / 2;
    },
    async getMidPrice(tokenId: string): Promise<number> {
      return this.getPrice(tokenId);
    },
  };
}

export function createHistoricalGammaClient(tickState: TickState): GammaClient {
  return {
    async getMarkets(params?: { limit?: number }): Promise<GammaMarket[]> {
      const markets = tickState.getMarkets();
      return params?.limit ? markets.slice(0, params.limit) : markets;
    },
    async getMarket(): Promise<GammaMarket | null> {
      return null;
    },
    async getMarketGroup(): Promise<null> {
      return null;
    },
    async searchMarkets(): Promise<GammaMarket[]> {
      return [];
    },
    async getTrending(limit?: number): Promise<GammaMarket[]> {
      return tickState.getMarkets().slice(0, limit ?? 15);
    },
    async getEvents(limit = 10): Promise<GammaEvent[]> {
      const markets = tickState.getMarkets();
      if (markets.length < 3) return [];
      const events: GammaEvent[] = [];
      for (let i = 0; i < markets.length && events.length < limit; i += 5) {
        const group = markets.slice(i, i + 5);
        if (group.length >= 2) {
          const eventIdx = Math.floor(i / 5);
          events.push({
            id: `event-${eventIdx}`,
            title: `Backtest Event Group ${eventIdx}`,
            slug: `backtest-event-${eventIdx}`,
            markets: group,
          });
        }
      }
      return events;
    },
  };
}

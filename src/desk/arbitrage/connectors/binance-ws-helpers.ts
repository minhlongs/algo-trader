/**
 * Binance WebSocket Stream Message Parsing & Orderbook Helpers
 * Extracted from binance-ws-connector.ts for pure depth level updates,
 * trade message normalization, and sorted orderbook snapshot construction.
 */

import type {
  BookLevel,
  NormalizedOrderBook,
  BinanceTradeMsg,
  NormalizedTrade,
} from './binance-ws-connector';

export function applyPriceLevelEntries(
  bookMap: Map<number, number>,
  entries: [string, string][],
  deleteOnZero: boolean,
): void {
  for (const [p, q] of entries) {
    const price = parseFloat(p);
    const qty = parseFloat(q);
    if (qty === 0) {
      if (deleteOnZero) bookMap.delete(price);
    } else if (qty > 0) {
      bookMap.set(price, qty);
    }
  }
}

export function normalizeBinanceTrade(msg: BinanceTradeMsg): NormalizedTrade {
  return {
    venue: 'binance',
    symbol: msg.s,
    side: msg.m ? 'sell' : 'buy',
    price: parseFloat(msg.p),
    amount: parseFloat(msg.q),
    timestamp: msg.T,
    tradeId: String(msg.t),
  };
}

export function buildSortedOrderBook(
  symbol: string,
  seq: number,
  bidsMap: Map<number, number>,
  asksMap: Map<number, number>,
  depth = 20,
): NormalizedOrderBook {
  const sortedBids: BookLevel[] = Array.from(bidsMap.entries())
    .map(([price, amount]) => ({ price, amount }))
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);
  const sortedAsks: BookLevel[] = Array.from(asksMap.entries())
    .map(([price, amount]) => ({ price, amount }))
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);
  return {
    venue: 'binance',
    symbol,
    timestamp: Date.now(),
    seq,
    bids: sortedBids,
    asks: sortedAsks,
  };
}

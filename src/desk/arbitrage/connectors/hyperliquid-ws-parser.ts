/**
 * Pure L2 Book & Trade Message Parsing Helpers for Hyperliquid WebSocket Streams.
 */

export interface BookLevel {
  price: number;
  amount: number;
}

export interface NormalizedOrderBook {
  venue: 'hyperliquid';
  symbol: string;
  timestamp: number;
  seq: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface HyperliquidL2Level {
  px: string;
  sz: string;
  n: number;
}

export interface HyperliquidL2BookData {
  coin: string;
  levels: [HyperliquidL2Level[], HyperliquidL2Level[]];
  time: number;
}

export interface HyperliquidL2BookMsg {
  channel: 'l2Book';
  data: HyperliquidL2BookData;
}

export interface HyperliquidTradeData {
  coin: string;
  side: 'B' | 'A' | 'buy' | 'sell';
  px: string;
  sz: string;
  time: number;
  hash?: string;
  tid?: number;
}

export interface HyperliquidTradesMsg {
  channel: 'trades';
  data: HyperliquidTradeData[];
}

export interface NormalizedTrade {
  venue: 'hyperliquid';
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  tradeId: string;
}

/**
 * Parse and sort raw Hyperliquid L2 levels into descending bids and ascending asks.
 */
export function parseHyperliquidL2Levels(
  rawBids: HyperliquidL2Level[],
  rawAsks: HyperliquidL2Level[],
): { bids: BookLevel[]; asks: BookLevel[] } {
  const bids = rawBids
    .map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.price - a.price);

  const asks = rawAsks
    .map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => a.price - b.price);

  return { bids, asks };
}

/**
 * Normalize raw Hyperliquid trade messages for a target coin symbol.
 */
export function parseHyperliquidTrades(
  payload: HyperliquidTradesMsg | HyperliquidTradeData[],
  coin: string,
): NormalizedTrade[] {
  const trades = Array.isArray(payload) ? payload : payload.data;
  const targetCoin = coin.toUpperCase();

  return trades
    .filter((t) => t.coin.toUpperCase() === targetCoin)
    .map((t) => ({
      venue: 'hyperliquid',
      symbol: t.coin.toUpperCase(),
      side: (t.side === 'B' || t.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
      price: parseFloat(t.px),
      amount: parseFloat(t.sz),
      timestamp: t.time,
      tradeId: t.hash ?? (t.tid !== undefined ? String(t.tid) : `${t.coin}-${t.time}-${t.px}-${t.sz}`),
    }));
}

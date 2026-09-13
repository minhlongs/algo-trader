/**
 * OKX WebSocket Types
 * Data structures for OKX WebSocket v5 API
 */

export interface OKXOrderBook {
  seqId: number;
  asks: [string, string, string, string][]; // [price, amount, count, liquidated]
  bids: [string, string, string, string][];
  timestamp: string;
}

export interface OKXTrade {
  instId: string;
  tradeId: string;
  px: string;
  sz: string;
  side: 'buy' | 'sell';
  ts: string;
}

export interface OKXTicker {
  instId: string;
  last: string;
  lastSz: string;
  askPx: string;
  askSz: string;
  bidPx: string;
  bidSz: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcyl24h: string;
  volUsd24h: string;
  ts: string;
}

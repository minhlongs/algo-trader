/**
 * Bybit WebSocket Client Types
 * WebSocket v5 API data models
 */

export interface BybitOrderBook {
  seq: number;
  bids: [string, string][]; // [price, size]
  asks: [string, string][];
  ts: number;
  u: number;
}

export interface BybitTrade {
  category: string;
  symbol: string;
  execId: string;
  price: string;
  size: string;
  side: 'Buy' | 'Sell';
  time: string;
  isBlockTrade: boolean;
}

export interface BybitTicker {
  category: string;
  symbol: string;
  lastPrice: string;
  indexPrice: string;
  markPrice: string;
  prevPrice24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  prevPrice1h: string;
  volume24h: string;
  turnover24h: string;
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
  openInterestValue: string;
}

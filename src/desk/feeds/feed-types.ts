export type ExchangeId = 'binance' | 'okx' | 'bybit';

export interface UnifiedOrderBook {
  exchange: ExchangeId;
  symbol: string;
  bids: { price: number; amount: number }[];
  asks: { price: number; amount: number }[];
  timestamp: number;
  latency: number;
}

export interface UnifiedTrade {
  exchange: ExchangeId;
  symbol: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeId?: string;
}

export interface UnifiedTicker {
  exchange: ExchangeId;
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export type FeedMessage =
  | { type: 'orderbook'; data: UnifiedOrderBook }
  | { type: 'trade'; data: UnifiedTrade }
  | { type: 'ticker'; data: UnifiedTicker };

export type FeedHandler = (msg: FeedMessage) => void;

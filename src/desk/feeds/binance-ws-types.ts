/**
 * Binance WebSocket Client — Types and payload data structures.
 * Docs: https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams
 */

export interface BinanceOrderBook {
  lastUpdateId: number;
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][];
}

export interface BinanceTrade {
  e: string; // event type
  E: number; // event time
  s: string; // symbol
  t: number; // trade id
  p: string; // price
  q: string; // quantity
  b: number; // buyer order id
  a: number; // seller order id
  T: number; // trade time
  m: boolean; // is buyer maker
}

export interface BinanceTicker {
  e: string; // event type
  E: number; // event time
  s: string; // symbol
  p: string; // price change
  P: string; // price change percent
  c: string; // last price
  o: string; // open price
  h: string; // high price
  l: string; // low price
  v: string; // volume
  q: string; // quote volume
}

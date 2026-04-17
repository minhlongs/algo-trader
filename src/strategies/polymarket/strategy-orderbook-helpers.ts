/**
 * Shared orderbook helper functions for Polymarket strategies.
 * Extracted from 33 strategy files — each had identical bestBidAsk() and related functions.
 */

import type { RawOrderBook } from '../../polymarket/clob-client.js';

/** Best bid/ask/mid extracted from a raw orderbook */
export interface BidAskMid {
  bid: number;
  ask: number;
  mid: number;
}

/** Extract best bid/ask/mid from raw order book. Default bid=0, ask=1. */
export function bestBidAsk(book: RawOrderBook): BidAskMid {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

/** Check if mid price is within valid binary market range (0, 1) exclusive. */
export function isValidMid(mid: number): boolean {
  return mid > 0 && mid < 1;
}

/** Calculate entry price based on side. YES = ask, NO = 1 - bid. */
export function calcEntryPrice(ba: BidAskMid, side: 'yes' | 'no'): number {
  return side === 'yes' ? ba.ask : 1 - ba.bid;
}

/** Calculate order size in shares from USDC amount and price. */
export function calcShareSize(sizeUsdc: number, price: number): number {
  return Math.round(sizeUsdc / price);
}

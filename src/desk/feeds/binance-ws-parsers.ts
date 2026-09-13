/**
 * Binance WebSocket Client — Parsers and symbol normalization.
 */

import type { BinanceOrderBook, BinanceTrade, BinanceTicker } from './binance-ws-types';

/**
 * Convert Binance-style symbols (BNBUSDT, BTCETH) to BASE/QUOTE format.
 * Match known quote-currency suffixes, longest first so BUSD beats USD.
 */
export function normalizeSymbol(symbol: string): string {
  const quotes = ['USDC', 'USDT', 'BUSD', 'BTC', 'ETH', 'USD'];
  for (const quote of quotes) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      const base = symbol.slice(0, symbol.length - quote.length);
      return `${base}/${quote}`;
    }
  }
  return symbol;
}

export function parseOrderBook(msg: Record<string, unknown>): BinanceOrderBook {
  return {
    lastUpdateId: msg.lastUpdateId as number,
    bids: msg.b as [string, string][],
    asks: msg.a as [string, string][],
  };
}

export function parseTrade(msg: Record<string, unknown>): BinanceTrade {
  return {
    e: msg.e as string,
    E: msg.E as number,
    s: msg.s as string,
    t: msg.t as number,
    p: msg.p as string,
    q: msg.q as string,
    b: msg.b as number,
    a: msg.a as number,
    T: msg.T as number,
    m: msg.m as boolean,
  };
}

export function parseTicker(msg: Record<string, unknown>): BinanceTicker {
  return {
    e: msg.e as string,
    E: msg.E as number,
    s: msg.s as string,
    p: msg.p as string,
    P: msg.P as string,
    c: msg.c as string,
    o: msg.o as string,
    h: msg.h as string,
    l: msg.l as string,
    v: msg.v as string,
    q: msg.q as string,
  };
}

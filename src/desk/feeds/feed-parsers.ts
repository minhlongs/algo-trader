import type { ExchangeId, UnifiedOrderBook, UnifiedTrade, UnifiedTicker } from './feed-types';
import type { BinanceOrderBook, BinanceTrade, BinanceTicker } from './binance-ws';
import type { OKXOrderBook, OKXTrade, OKXTicker } from './okx-ws';
import type { BybitOrderBook, BybitTrade, BybitTicker } from './bybit-ws';

export function parseOrderBook(
  exchange: ExchangeId,
  data: unknown
): UnifiedOrderBook | null {
  if (exchange === 'binance') {
    const binanceBook = data as BinanceOrderBook;
    return {
      exchange,
      symbol: '',
      bids: binanceBook.bids.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      asks: binanceBook.asks.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      timestamp: Date.now(),
      latency: 0,
    };
  }

  if (exchange === 'okx') {
    const okxBook = data as OKXOrderBook;
    return {
      exchange,
      symbol: '',
      bids: okxBook.bids.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      asks: okxBook.asks.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      timestamp: Date.now(),
      latency: 0,
    };
  }

  if (exchange === 'bybit') {
    const bybitBook = data as BybitOrderBook;
    return {
      exchange,
      symbol: '',
      bids: bybitBook.bids.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      asks: bybitBook.asks.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      timestamp: Date.now(),
      latency: 0,
    };
  }

  return null;
}

export function parseTrade(exchange: ExchangeId, data: unknown): UnifiedTrade | null {
  if (exchange === 'binance') {
    const binanceTrade = data as BinanceTrade;
    return {
      exchange,
      symbol: binanceTrade.s,
      price: parseFloat(binanceTrade.p),
      amount: parseFloat(binanceTrade.q),
      side: binanceTrade.m ? 'sell' : 'buy',
      timestamp: binanceTrade.T,
      tradeId: String(binanceTrade.t),
    };
  }

  if (exchange === 'okx') {
    const okxTrade = data as OKXTrade;
    return {
      exchange,
      symbol: okxTrade.instId.replace('-', '/'),
      price: parseFloat(okxTrade.px),
      amount: parseFloat(okxTrade.sz),
      side: okxTrade.side,
      timestamp: parseInt(okxTrade.ts),
      tradeId: okxTrade.tradeId,
    };
  }

  if (exchange === 'bybit') {
    const bybitTrade = data as BybitTrade;
    return {
      exchange,
      symbol: bybitTrade.symbol,
      price: parseFloat(bybitTrade.price),
      amount: parseFloat(bybitTrade.size),
      side: bybitTrade.side.toLowerCase() as 'buy' | 'sell',
      timestamp: parseInt(bybitTrade.time),
      tradeId: bybitTrade.execId,
    };
  }

  return null;
}

export function parseTicker(exchange: ExchangeId, data: unknown): UnifiedTicker | null {
  if (exchange === 'binance') {
    const binanceTicker = data as BinanceTicker;
    return {
      exchange,
      symbol: binanceTicker.s,
      last: parseFloat(binanceTicker.c),
      bid: 0,
      ask: 0,
      high24h: parseFloat(binanceTicker.h),
      low24h: parseFloat(binanceTicker.l),
      volume24h: parseFloat(binanceTicker.v),
      timestamp: binanceTicker.E,
    };
  }

  if (exchange === 'okx') {
    const okxTicker = data as OKXTicker;
    return {
      exchange,
      symbol: okxTicker.instId.replace('-', '/'),
      last: parseFloat(okxTicker.last),
      bid: parseFloat(okxTicker.bidPx),
      ask: parseFloat(okxTicker.askPx),
      high24h: parseFloat(okxTicker.high24h),
      low24h: parseFloat(okxTicker.low24h),
      volume24h: parseFloat(okxTicker.volUsd24h),
      timestamp: parseInt(okxTicker.ts),
    };
  }

  if (exchange === 'bybit') {
    const bybitTicker = data as BybitTicker;
    return {
      exchange,
      symbol: bybitTicker.symbol,
      last: parseFloat(bybitTicker.lastPrice),
      bid: 0,
      ask: 0,
      high24h: parseFloat(bybitTicker.highPrice24h),
      low24h: parseFloat(bybitTicker.lowPrice24h),
      volume24h: parseFloat(bybitTicker.volume24h),
      timestamp: Date.now(),
    };
  }

  return null;
}

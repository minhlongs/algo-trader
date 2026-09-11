/**
 * Bybit WebSocket Message Parsers
 * Pure parsing and normalization functions for v5 API data
 */

import { BybitOrderBook, BybitTrade, BybitTicker } from './bybit-ws-types';

export function extractSymbol(topic: string): string | null {
  const parts = topic.split('.');
  if (parts.length < 2) return null;
  const rawSymbol = parts.length >= 3 ? parts[2] : parts[1];
  const match = rawSymbol.match(/^([A-Z]+)(USDT|USDC|USD|BTC|ETH)$/);
  return match ? `${match[1]}/${match[2]}` : rawSymbol;
}

export function parseOrderBook(data: Record<string, unknown>): BybitOrderBook {
  const norm = (raw: unknown): string[][] =>
    Array.isArray(raw) && raw.length > 0
      ? Array.isArray(raw[0]) && Array.isArray((raw[0] as unknown[])[0])
        ? (raw[0] as string[][])
        : (raw as string[][])
      : [];
  const bids = norm(data.b).map((l: string[]) => [l[0], l[1]] as [string, string]);
  const asks = norm(data.a).map((l: string[]) => [l[0], l[1]] as [string, string]);
  return {
    seq: Number(data.seq ?? 0),
    bids,
    asks,
    ts: Number(data.ts ?? 0),
    u: Number(data.u ?? 0),
  };
}

export function parseTrade(data: Record<string, unknown>): BybitTrade {
  return {
    category: data.category as string,
    symbol: data.symbol as string,
    execId: data.execId as string,
    price: data.price as string,
    size: data.size as string,
    side: data.side as 'Buy' | 'Sell',
    time: data.time as string,
    isBlockTrade: data.isBlockTrade as boolean,
  };
}

export function parseTicker(data: Record<string, unknown>): BybitTicker {
  return {
    category: data.category as string,
    symbol: data.symbol as string,
    lastPrice: data.lastPrice as string,
    indexPrice: data.indexPrice as string,
    markPrice: data.markPrice as string,
    prevPrice24h: data.prevPrice24h as string,
    price24hPcnt: data.price24hPcnt as string,
    highPrice24h: data.highPrice24h as string,
    lowPrice24h: data.lowPrice24h as string,
    prevPrice1h: data.prevPrice1h as string,
    volume24h: data.volume24h as string,
    turnover24h: data.turnover24h as string,
    fundingRate: data.fundingRate as string,
    nextFundingTime: data.nextFundingTime as string,
    openInterest: data.openInterest as string,
    openInterestValue: data.openInterestValue as string,
  };
}

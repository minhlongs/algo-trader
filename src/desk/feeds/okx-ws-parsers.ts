/**
 * OKX WebSocket Message Parsers
 * Pure parsing and normalization functions for v5 API data
 */

import { OKXOrderBook, OKXTrade, OKXTicker } from './okx-ws-types';

export function parseOrderBook(data: Record<string, unknown>): OKXOrderBook {
  const asks = (data.asks as string[][][])?.[0]?.map((l: string[]) => [l[0], l[1], l[2], l[3]] as [string, string, string, string]) || [];
  const bids = (data.bids as string[][][])?.[0]?.map((l: string[]) => [l[0], l[1], l[2], l[3]] as [string, string, string, string]) || [];
  return {
    seqId: Number(data.seqId ?? 0),
    asks,
    bids,
    timestamp: data.ts as string,
  };
}

export function parseTrade(data: Record<string, unknown>): OKXTrade {
  return {
    instId: data.instId as string,
    tradeId: data.tradeId as string,
    px: data.px as string,
    sz: data.sz as string,
    side: data.side as 'buy' | 'sell',
    ts: data.ts as string,
  };
}

export function parseTicker(data: Record<string, unknown>): OKXTicker {
  return {
    instId: data.instId as string,
    last: data.last as string,
    lastSz: data.lastSz as string,
    askPx: data.askPx as string,
    askSz: data.askSz as string,
    bidPx: data.bidPx as string,
    bidSz: data.bidSz as string,
    open24h: data.open24h as string,
    high24h: data.high24h as string,
    low24h: data.low24h as string,
    volCcyl24h: data.volCcyl24h as string,
    volUsd24h: data.volUsd24h as string,
    ts: data.ts as string,
  };
}

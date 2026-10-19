/**
 * dYdX v4 Indexer Response Shapes & Parsers
 *
 * @module desk/markets/cex/dydx-v4-indexer-parser
 */

import type { CexCandle, CexOrderBook, CexBalance } from './cex-types';

export const DEFAULT_INDEXER_URL = 'https://indexer.dydx.trade';
export const DYDX_RATE_PER_SEC = 15;

export interface IndexerCandleEntry {
  startedAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  baseTokenVolume: string;
}

export interface IndexerOrderBookEntry {
  price: string;
  size: string;
}

export interface IndexerOrderBookResponse {
  bids: IndexerOrderBookEntry[];
  asks: IndexerOrderBookEntry[];
}

export interface IndexerSubaccountAssetPosition {
  symbol: string;
  side: string;
  size: string;
  assetId: string;
}

export interface IndexerSubaccountResponse {
  subaccount: {
    address: string;
    subaccountNumber: number;
    equity: string;
    freeCollateral: string;
    assetPositions: IndexerSubaccountAssetPosition[];
  };
}

export const TIMEFRAME_TO_RESOLUTION: Record<string, string> = {
  '1m': '1MIN',
  '5m': '5MINS',
  '15m': '15MINS',
  '30m': '30MINS',
  '1h': '1HOUR',
  '4h': '4HOURS',
  '1d': '1DAY',
};

export function parseIndexerCandles(entries: IndexerCandleEntry[]): CexCandle[] {
  return (entries ?? []).map((c): CexCandle => ({
    timestamp: new Date(c.startedAt).getTime(),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.baseTokenVolume),
  }));
}

export function parseIndexerOrderBook(ticker: string, data: IndexerOrderBookResponse): CexOrderBook {
  return {
    symbol: ticker,
    bids: (data.bids ?? []).map(e => ({ price: parseFloat(e.price), size: parseFloat(e.size) })),
    asks: (data.asks ?? []).map(e => ({ price: parseFloat(e.price), size: parseFloat(e.size) })),
    timestamp: Date.now(),
  };
}

export function parseIndexerBalances(data: IndexerSubaccountResponse): CexBalance[] {
  const { subaccount } = data;
  const balances: CexBalance[] = [
    {
      asset: 'USDC',
      free: parseFloat(subaccount.freeCollateral ?? '0'),
      locked: Math.max(
        0,
        parseFloat(subaccount.equity ?? '0') - parseFloat(subaccount.freeCollateral ?? '0'),
      ),
      total: parseFloat(subaccount.equity ?? '0'),
    },
  ];

  for (const pos of subaccount.assetPositions ?? []) {
    const size = parseFloat(pos.size ?? '0');
    if (size === 0) continue;
    balances.push({ asset: pos.symbol, free: size, locked: 0, total: size });
  }

  return balances;
}

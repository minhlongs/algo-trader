/**
 * dYdX v4 Read-Only Market Data + Balance Client
 *
 * MVP: REST only, no WebSocket, no order placement.
 * Uses the dYdX v4 Indexer REST API (public + private endpoints).
 *
 * Required env vars (for private endpoints):
 *   DYDX_ADDRESS        — dYdX chain address (dydx1...)
 *   DYDX_INDEXER_URL    — Indexer base URL (default: https://indexer.dydx.trade)
 *
 * Pinned API: dYdX Indexer REST v4 (no npm SDK needed — pure fetch)
 * Docs: https://indexer.dydx.trade/v4/documentation
 */

import { resilientFetch } from '../../../shared/resilience/resilient-fetch';
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';
import type { CexCandle, CexOrderBook, CexBalance } from './cex-types';
import {
  DEFAULT_INDEXER_URL,
  DYDX_RATE_PER_SEC,
  TIMEFRAME_TO_RESOLUTION,
  parseIndexerCandles,
  parseIndexerOrderBook,
  parseIndexerBalances,
  type IndexerCandleEntry,
  type IndexerOrderBookResponse,
  type IndexerSubaccountResponse,
} from './dydx-v4-indexer-parser';

export class DydxV4ReadonlyClient {
  private readonly indexerUrl: string;
  private readonly address: string;

  constructor(indexerUrl?: string) {
    this.indexerUrl = (indexerUrl ?? process.env.DYDX_INDEXER_URL ?? DEFAULT_INDEXER_URL).replace(
      /\/$/,
      '',
    );
    this.address = process.env.DYDX_ADDRESS ?? '';
    rateLimiterRegistry.getOrCreate('dydx-v4', DYDX_RATE_PER_SEC);
  }

  /**
   * Fetch OHLCV candles for a dYdX perpetual market.
   */
  async getCandles(ticker: string, timeframe = '1h', limit = 100): Promise<CexCandle[]> {
    const resolution = TIMEFRAME_TO_RESOLUTION[timeframe];
    if (!resolution) {
      throw new Error(
        `Unsupported timeframe "${timeframe}". Supported: ${Object.keys(TIMEFRAME_TO_RESOLUTION).join(', ')}`,
      );
    }

    const url = `${this.indexerUrl}/v4/candles/perpetualMarkets/${encodeURIComponent(ticker)}?resolution=${resolution}&limit=${limit}`;
    const res = await resilientFetch(url, {}, { label: 'dydx-candles', maxRetries: 3 });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`dYdX Indexer candles error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { candles: IndexerCandleEntry[] };
    return parseIndexerCandles(data.candles);
  }

  /**
   * Fetch order-book snapshot for a dYdX perpetual market.
   */
  async getOrderBook(ticker: string): Promise<CexOrderBook> {
    const url = `${this.indexerUrl}/v4/orderbooks/perpetualMarket/${encodeURIComponent(ticker)}`;
    const res = await resilientFetch(url, {}, { label: 'dydx-orderbook', maxRetries: 3 });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`dYdX Indexer orderbook error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as IndexerOrderBookResponse;
    return parseIndexerOrderBook(ticker, data);
  }

  /**
   * Fetch account balances/positions for subaccount 0.
   */
  async getBalances(): Promise<CexBalance[]> {
    if (!this.address) {
      throw new Error('DYDX_ADDRESS env var is required for balance queries');
    }

    const url = `${this.indexerUrl}/v4/addresses/${encodeURIComponent(this.address)}/subaccountNumber/0`;
    const res = await resilientFetch(url, {}, { label: 'dydx-balances', maxRetries: 3 });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`dYdX Indexer subaccount error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as IndexerSubaccountResponse;
    return parseIndexerBalances(data);
  }

  /** Return client name for logging */
  getName(): string {
    return 'dydx-v4-readonly';
  }
}

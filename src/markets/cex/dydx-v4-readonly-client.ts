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

import { resilientFetch } from '../../shared/resilience/resilient-fetch.js';
import { rateLimiterRegistry } from '../../shared/resilience/rate-limiter.js';
import type { CexCandle, CexOrderBook, CexBalance } from './cex-types.js';

// dYdX Indexer public REST base URL (mainnet)
const DEFAULT_INDEXER_URL = 'https://indexer.dydx.trade';

// dYdX Indexer rate limit: 175 req/10s → ~17 req/sec
const DYDX_RATE_PER_SEC = 15;

// ── Raw Indexer response shapes ────────────────────────────────────────────────

interface IndexerCandleEntry {
  startedAt: string; // ISO8601
  open: string;
  high: string;
  low: string;
  close: string;
  baseTokenVolume: string;
}

interface IndexerOrderBookEntry {
  price: string;
  size: string;
}

interface IndexerOrderBookResponse {
  bids: IndexerOrderBookEntry[];
  asks: IndexerOrderBookEntry[];
}

interface IndexerSubaccountAssetPosition {
  symbol: string;
  side: string;
  size: string;
  assetId: string;
}

interface IndexerSubaccountResponse {
  subaccount: {
    address: string;
    subaccountNumber: number;
    equity: string;
    freeCollateral: string;
    assetPositions: IndexerSubaccountAssetPosition[];
  };
}

// ── Resolution mapping ─────────────────────────────────────────────────────────

/** Maps common timeframe strings to dYdX Indexer resolution parameter */
const TIMEFRAME_TO_RESOLUTION: Record<string, string> = {
  '1m': '1MIN',
  '5m': '5MINS',
  '15m': '15MINS',
  '30m': '30MINS',
  '1h': '1HOUR',
  '4h': '4HOURS',
  '1d': '1DAY',
};

export class DydxV4ReadonlyClient {
  private readonly indexerUrl: string;
  private readonly address: string;

  constructor(indexerUrl?: string) {
    this.indexerUrl = (indexerUrl ?? process.env.DYDX_INDEXER_URL ?? DEFAULT_INDEXER_URL).replace(
      /\/$/,
      '',
    );
    this.address = process.env.DYDX_ADDRESS ?? '';

    // Register rate limiter for observability
    rateLimiterRegistry.getOrCreate('dydx-v4', DYDX_RATE_PER_SEC);
  }

  // ── Market data (public) ────────────────────────────────────────────────────

  /**
   * Fetch OHLCV candles for a dYdX perpetual market.
   * @param ticker  dYdX market ticker, e.g. "BTC-USD"
   * @param timeframe  e.g. "1h", "1d" (see TIMEFRAME_TO_RESOLUTION)
   * @param limit  max candles to return (default 100)
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
    return (data.candles ?? []).map((c): CexCandle => ({
      timestamp: new Date(c.startedAt).getTime(),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.baseTokenVolume),
    }));
  }

  /**
   * Fetch order-book snapshot for a dYdX perpetual market.
   * @param ticker  dYdX market ticker, e.g. "BTC-USD"
   */
  async getOrderBook(ticker: string): Promise<CexOrderBook> {
    const url = `${this.indexerUrl}/v4/orderbooks/perpetualMarket/${encodeURIComponent(ticker)}`;
    const res = await resilientFetch(url, {}, { label: 'dydx-orderbook', maxRetries: 3 });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`dYdX Indexer orderbook error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as IndexerOrderBookResponse;
    return {
      symbol: ticker,
      bids: (data.bids ?? []).map(e => ({ price: parseFloat(e.price), size: parseFloat(e.size) })),
      asks: (data.asks ?? []).map(e => ({ price: parseFloat(e.price), size: parseFloat(e.size) })),
      timestamp: Date.now(),
    };
  }

  // ── Account (read-only, requires DYDX_ADDRESS) ───────────────────────────────

  /**
   * Fetch account balances/positions for subaccount 0.
   * READ-ONLY — no signing required (Indexer is public).
   * Requires DYDX_ADDRESS env var.
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
    const { subaccount } = data;

    // Return equity as USDC balance + any asset positions as additional entries
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

  /** Return client name for logging */
  getName(): string {
    return 'dydx-v4-readonly';
  }
}

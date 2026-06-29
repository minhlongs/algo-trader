/**
 * Binance Spot Market Data + Order Client
 *
 * Uses ccxt for exchange communication.
 * Perp/leverage is GATED behind CEX_PERP_ENABLED=true feature flag.
 *
 * Required env vars:
 *   BINANCE_API_KEY     — REST API key (read or trade permission)
 *   BINANCE_API_SECRET  — REST API secret
 */

import * as ccxt from 'ccxt';
import type {
  CexCandle,
  CexOrderBook,
  CexBalance,
  CexSpotOrderRequest,
  CexOrderResponse,
  CexFeatureFlags,
} from './cex-types';
import { loadFeatureFlags } from './cex-types';
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';

// Binance spot: 1200 request weight/min → ~20 req/sec conservative
const BINANCE_RATE_PER_SEC = 20;

// ccxt OHLCV tuple: [timestamp, open, high, low, close, volume]
type OhlcvTuple = [number, number, number, number, number, number];

/** Minimal interface for the ccxt exchange methods we use — enables injection in tests */
export interface CcxtExchangeAdapter {
  fetchOHLCV(symbol: string, timeframe: string, since: undefined, limit: number): Promise<OhlcvTuple[]>;
  fetchOrderBook(symbol: string, limit: number): Promise<{
    bids: [number, number][];
    asks: [number, number][];
    timestamp: number | undefined;
  }>;
  fetchBalance(): Promise<{
    total: Record<string, number>;
    free: Record<string, number>;
    used: Record<string, number>;
  }>;
  createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price: number | undefined,
  ): Promise<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    amount: number;
    price: number | null | undefined;
    status: string | null | undefined;
    timestamp: number | null | undefined;
  }>;
}

/** Create a real ccxt Binance exchange instance */
export function createBinanceExchange(): CcxtExchangeAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BinanceCtor = (ccxt as any).binance as new (opts: unknown) => CcxtExchangeAdapter;
  return new BinanceCtor({
    apiKey: process.env.BINANCE_API_KEY ?? '',
    secret: process.env.BINANCE_API_SECRET ?? '',
    options: {
      defaultType: 'spot',
      adjustForTimeDifference: true,
    },
    enableRateLimit: true,
  });
}

/** Maps ccxt OHLCV tuple to CexCandle */
function toCexCandle(ohlcv: OhlcvTuple): CexCandle {
  return {
    timestamp: ohlcv[0],
    open: ohlcv[1],
    high: ohlcv[2],
    low: ohlcv[3],
    close: ohlcv[4],
    volume: ohlcv[5],
  };
}

export class BinanceSpotClient {
  private readonly exchange: CcxtExchangeAdapter;
  private readonly flags: CexFeatureFlags;

  /**
   * @param flags  Feature flags (default: read from env)
   * @param exchange  Injectable ccxt adapter (default: real Binance instance)
   */
  constructor(flags?: CexFeatureFlags, exchange?: CcxtExchangeAdapter) {
    this.flags = flags ?? loadFeatureFlags();
    this.exchange = exchange ?? createBinanceExchange();

    // Register in global registry for observability/dashboards
    rateLimiterRegistry.getOrCreate('binance', BINANCE_RATE_PER_SEC);
  }

  // ── Market data (public) ────────────────────────────────────────────────────

  /**
   * Fetch OHLCV candles for a symbol.
   * @param symbol  ccxt-style symbol, e.g. "BTC/USDT"
   * @param timeframe  ccxt timeframe string, e.g. "1m", "1h"
   * @param limit  number of candles (default 100)
   */
  async getCandles(symbol: string, timeframe = '1h', limit = 100): Promise<CexCandle[]> {
    const raw = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return raw.map(toCexCandle);
  }

  /**
   * Fetch order-book snapshot for a symbol.
   * @param symbol  ccxt-style symbol, e.g. "BTC/USDT"
   * @param depth   number of price levels per side (default 20)
   */
  async getOrderBook(symbol: string, depth = 20): Promise<CexOrderBook> {
    const raw = await this.exchange.fetchOrderBook(symbol, depth);
    return {
      symbol,
      bids: raw.bids.map(([price, size]: [number, number]) => ({ price, size })),
      asks: raw.asks.map(([price, size]: [number, number]) => ({ price, size })),
      timestamp: raw.timestamp ?? Date.now(),
    };
  }

  // ── Account (authenticated) ─────────────────────────────────────────────────

  /**
   * Fetch spot balances for all non-zero assets.
   * Requires BINANCE_API_KEY + BINANCE_API_SECRET with read permission.
   */
  async getBalances(): Promise<CexBalance[]> {
    const raw = await this.exchange.fetchBalance();
    const result: CexBalance[] = [];
    for (const [asset, total] of Object.entries(raw.total ?? {})) {
      if ((total ?? 0) === 0) continue;
      result.push({
        asset,
        free: raw.free?.[asset] ?? 0,
        locked: raw.used?.[asset] ?? 0,
        total: total ?? 0,
      });
    }
    return result;
  }

  // ── Order placement (spot only) ─────────────────────────────────────────────

  /**
   * Place a spot order on Binance.
   * Perp/leverage is blocked by default — set CEX_PERP_ENABLED=true to enable.
   * @param req  Order parameters
   */
  async placeOrder(req: CexSpotOrderRequest): Promise<CexOrderResponse> {
    if (!this.flags.perpEnabled && req.symbol.includes(':')) {
      // ccxt uses "BTC/USDT:USDT" notation for perp contracts
      throw new Error(
        `Perp orders are disabled (CEX_PERP_ENABLED=false). Symbol: ${req.symbol}`,
      );
    }

    const raw = await this.exchange.createOrder(
      req.symbol,
      req.type,
      req.side,
      req.amount,
      req.price,
    );

    return {
      id: raw.id,
      symbol: raw.symbol,
      side: raw.side as 'buy' | 'sell',
      type: raw.type,
      amount: raw.amount,
      price: raw.price ?? undefined,
      status: raw.status ?? 'unknown',
      timestamp: raw.timestamp ?? Date.now(),
    };
  }

  /** Return exchange name for logging/identification */
  getName(): string {
    return 'binance-spot';
  }
}

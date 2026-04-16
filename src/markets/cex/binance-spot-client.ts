/**
 * Binance Spot Market Data + Order Client
 *
 * Uses ccxt (already in deps) for auth/REST/retry.
 * Perp/leverage is GATED behind CEX_PERP_ENABLED=true feature flag.
 *
 * Required env vars:
 *   BINANCE_API_KEY     — REST API key (read or trade permission)
 *   BINANCE_API_SECRET  — REST API secret
 */

import ccxt from 'ccxt';
import type {
  CexCandle,
  CexOrderBook,
  CexBalance,
  CexSpotOrderRequest,
  CexOrderResponse,
  CexFeatureFlags,
} from './cex-types.js';
import { loadFeatureFlags } from './cex-types.js';
import { rateLimiterRegistry } from '../../resilience/rate-limiter.js';

// Binance spot: 1200 request weight/min → ~20 req/sec conservative
const BINANCE_RATE_PER_SEC = 20;

/** Maps ccxt OHLCV tuple to CexCandle */
function toCexCandle(ohlcv: ccxt.OHLCV): CexCandle {
  return {
    timestamp: ohlcv[0] as number,
    open: ohlcv[1] as number,
    high: ohlcv[2] as number,
    low: ohlcv[3] as number,
    close: ohlcv[4] as number,
    volume: ohlcv[5] as number,
  };
}

/** Maps ccxt order-book to CexOrderBook */
function toCexOrderBook(raw: ccxt.OrderBook, symbol: string): CexOrderBook {
  return {
    symbol,
    bids: raw.bids.map(([price, size]) => ({ price, size })),
    asks: raw.asks.map(([price, size]) => ({ price, size })),
    timestamp: raw.timestamp ?? Date.now(),
  };
}

export class BinanceSpotClient {
  private readonly exchange: ccxt.binance;
  private readonly flags: CexFeatureFlags;

  constructor(flags?: CexFeatureFlags) {
    this.flags = flags ?? loadFeatureFlags();

    this.exchange = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY ?? '',
      secret: process.env.BINANCE_API_SECRET ?? '',
      options: {
        defaultType: 'spot', // always spot; perp requires flag
        adjustForTimeDifference: true,
      },
      enableRateLimit: true, // ccxt built-in rate limiting
    });

    // Also register in our global registry for observability
    rateLimiterRegistry.getOrCreate('binance', BINANCE_RATE_PER_SEC);
  }

  // ── Market data (public) ────────────────────────────────────────────────────

  /**
   * Fetch OHLCV candles for a symbol.
   * @param symbol  ccxt-style symbol, e.g. "BTC/USDT"
   * @param timeframe  ccxt timeframe string, e.g. "1m", "1h"
   * @param limit  number of candles (default 100)
   */
  async getCandles(
    symbol: string,
    timeframe = '1h',
    limit = 100,
  ): Promise<CexCandle[]> {
    const raw = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return raw.map(toCexCandle);
  }

  /**
   * Fetch order-book snapshot for a symbol.
   * @param symbol  ccxt-style symbol
   * @param depth   number of price levels (default 20)
   */
  async getOrderBook(symbol: string, depth = 20): Promise<CexOrderBook> {
    const raw = await this.exchange.fetchOrderBook(symbol, depth);
    return toCexOrderBook(raw, symbol);
  }

  // ── Account (authenticated) ──────────────────────────────────────────────────

  /**
   * Fetch spot balances for all non-zero assets.
   * Requires BINANCE_API_KEY + BINANCE_API_SECRET with read permission.
   */
  async getBalances(): Promise<CexBalance[]> {
    const raw = await this.exchange.fetchBalance();
    const result: CexBalance[] = [];

    for (const [asset, bal] of Object.entries(raw.total ?? {})) {
      const total = bal ?? 0;
      if (total === 0) continue;
      result.push({
        asset,
        free: (raw.free?.[asset] as number | undefined) ?? 0,
        locked: (raw.used?.[asset] as number | undefined) ?? 0,
        total,
      });
    }

    return result;
  }

  // ── Order placement (spot only) ──────────────────────────────────────────────

  /**
   * Place a spot order on Binance.
   * Perp/leverage is NOT supported — throws if CEX_PERP_ENABLED=false (default).
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

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

// ccxt uses CJS exports; import as namespace to access named exchange classes
import * as ccxt from 'ccxt';
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

// ccxt OHLCV tuple: [timestamp, open, high, low, close, volume]
type OhlcvTuple = [number, number, number, number, number, number];

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

/** Maps ccxt order-book raw response to CexOrderBook */
function toCexOrderBook(
  raw: { bids: [number, number][]; asks: [number, number][]; timestamp: number | undefined },
  symbol: string,
): CexOrderBook {
  return {
    symbol,
    bids: raw.bids.map(([price, size]: [number, number]) => ({ price, size })),
    asks: raw.asks.map(([price, size]: [number, number]) => ({ price, size })),
    timestamp: raw.timestamp ?? Date.now(),
  };
}

export class BinanceSpotClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly exchange: any;
  private readonly flags: CexFeatureFlags;

  constructor(flags?: CexFeatureFlags) {
    this.flags = flags ?? loadFeatureFlags();

    // ccxt.binance is the exchange class constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BinanceCtor = (ccxt as any).binance as new (opts: unknown) => unknown;
    this.exchange = new BinanceCtor({
      apiKey: process.env.BINANCE_API_KEY ?? '',
      secret: process.env.BINANCE_API_SECRET ?? '',
      options: {
        defaultType: 'spot', // always spot; perp requires explicit flag
        adjustForTimeDifference: true,
      },
      enableRateLimit: true, // ccxt built-in rate limiting
    });

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
    const raw: OhlcvTuple[] = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return raw.map(toCexCandle);
  }

  /**
   * Fetch order-book snapshot for a symbol.
   * @param symbol  ccxt-style symbol, e.g. "BTC/USDT"
   * @param depth   number of price levels per side (default 20)
   */
  async getOrderBook(symbol: string, depth = 20): Promise<CexOrderBook> {
    const raw: { bids: [number, number][]; asks: [number, number][]; timestamp: number | undefined } =
      await this.exchange.fetchOrderBook(symbol, depth);
    return toCexOrderBook(raw, symbol);
  }

  // ── Account (authenticated) ─────────────────────────────────────────────────

  /**
   * Fetch spot balances for all non-zero assets.
   * Requires BINANCE_API_KEY + BINANCE_API_SECRET with read permission.
   */
  async getBalances(): Promise<CexBalance[]> {
    const raw: {
      total: Record<string, number>;
      free: Record<string, number>;
      used: Record<string, number>;
    } = await this.exchange.fetchBalance();

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

    const raw: {
      id: string;
      symbol: string;
      side: string;
      type: string;
      amount: number;
      price: number | null | undefined;
      status: string | null | undefined;
      timestamp: number | null | undefined;
    } = await this.exchange.createOrder(
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

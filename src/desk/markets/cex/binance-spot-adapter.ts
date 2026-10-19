/**
 * Adapter and mapping helpers for Binance Spot CCXT integration.
 */
import * as ccxt from 'ccxt';
import type { CexCandle } from './cex-types';

// Binance spot: 1200 request weight/min → ~20 req/sec conservative
export const BINANCE_RATE_PER_SEC = 20;

// ccxt OHLCV tuple: [timestamp, open, high, low, close, volume]
export type OhlcvTuple = [number, number, number, number, number, number];

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
  const ccxtModules = ccxt as unknown as Record<string, new (opts: unknown) => CcxtExchangeAdapter>;
  const BinanceCtor = ccxtModules.binance;
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
export function toCexCandle(ohlcv: OhlcvTuple): CexCandle {
  return {
    timestamp: ohlcv[0],
    open: ohlcv[1],
    high: ohlcv[2],
    low: ohlcv[3],
    close: ohlcv[4],
    volume: ohlcv[5],
  };
}

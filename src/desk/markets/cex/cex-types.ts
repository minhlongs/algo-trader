/**
 * Shared types for CEX market data adapters (Binance + dYdX v4).
 * All adapters produce these normalized shapes; strategy code depends only on this module.
 */

/** Normalized OHLCV candle (matches ICandle from IStrategy.ts) */
export interface CexCandle {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Normalized order-book level */
export interface CexBookLevel {
  price: number;
  size: number;
}

/** Normalized order-book snapshot */
export interface CexOrderBook {
  symbol: string;
  bids: CexBookLevel[];
  asks: CexBookLevel[];
  timestamp: number; // Unix ms
}

/** Normalized balance entry */
export interface CexBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

/** Spot order placement request (Binance only; gated by CEX_PERP_ENABLED) */
export interface CexSpotOrderRequest {
  symbol: string; // e.g. "BTC/USDT"
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number; // required for limit orders
}

/** Normalized order response */
export interface CexOrderResponse {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price: number | undefined;
  status: string;
  timestamp: number;
}

/** Feature-flag configuration */
export interface CexFeatureFlags {
  /** If false, perp/leverage endpoints throw immediately (default: false) */
  perpEnabled: boolean;
}

export function loadFeatureFlags(): CexFeatureFlags {
  return {
    perpEnabled: process.env.CEX_PERP_ENABLED === 'true',
  };
}

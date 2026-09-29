/**
 * CCXT Exchange Connector Types & Interfaces
 * Provides uniform data structures and configuration options for CEX integrations.
 */

export type SupportedCexExchange = 'binance' | 'bybit' | 'kucoin';

export interface CcxtRawFee {
  cost?: number;
  currency?: string;
}

export interface CcxtRawOrder {
  id: string;
  clientOrderId?: string;
  symbol: string;
  type: string;
  side: string;
  amount: number;
  price?: number | null;
  average?: number | null;
  filled?: number;
  remaining?: number;
  status: string | null;
  fee?: CcxtRawFee;
  timestamp?: number | null;
  info?: Record<string, unknown>;
}

export interface CcxtRawBalance {
  free?: Record<string, number | undefined>;
  used?: Record<string, number | undefined>;
  total?: Record<string, number | undefined>;
  info?: Record<string, unknown>;
}

/** Minimal injectable CCXT exchange interface */
export interface CcxtExchangeAdapter {
  createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: Record<string, unknown>
  ): Promise<CcxtRawOrder>;
  cancelOrder(id: string, symbol?: string, params?: Record<string, unknown>): Promise<unknown>;
  fetchOrder(id: string, symbol?: string, params?: Record<string, unknown>): Promise<CcxtRawOrder>;
  fetchBalance(params?: Record<string, unknown>): Promise<CcxtRawBalance>;
  fetchTime?(): Promise<number>;
  fetchStatus?(): Promise<Record<string, unknown>>;
}

export interface CcxtExchangeConnectorOptions {
  apiKey?: string;
  secret?: string;
  password?: string; // KuCoin passphrase
  testnet?: boolean;
  timeoutMs?: number;
  rateLimit?: boolean;
}

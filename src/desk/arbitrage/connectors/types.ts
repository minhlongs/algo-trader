/**
 * Exchange Connector Interface and Domain Types
 * Unified contract for CEX and prediction market order routing, balance interrogation,
 * and latency telemetry.
 */

import { z } from 'zod';

// ── Venue Identifiers ────────────────────────────────────────────────────────

export type SupportedExchangeId = 'binance' | 'bybit' | 'kucoin' | 'polymarket';

export type ExchangeOrderSide = 'buy' | 'sell';
export type ExchangeOrderType = 'market' | 'limit';
export type ExchangeOrderStatus = 'open' | 'closed' | 'canceled' | 'rejected' | 'expired';

// ── Zod Validation Schemas ───────────────────────────────────────────────────

export const ExchangeOrderParamsSchema = z
  .object({
    symbol: z.string().min(1, 'Symbol cannot be empty'),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit']),
    amount: z.number().positive('Amount must be strictly positive'),
    price: z.number().positive('Price must be positive').optional(),
    clientOrderId: z.string().optional(),
  })
  .refine(
    (data) => data.type !== 'limit' || (data.price !== undefined && data.price > 0),
    { message: 'Price is required and must be positive for limit orders', path: ['price'] },
  );

export type ExchangeOrderParams = z.infer<typeof ExchangeOrderParamsSchema>;

export const ExchangeOrderFeeSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
});

export type ExchangeOrderFee = z.infer<typeof ExchangeOrderFeeSchema>;

export const ExchangeOrderResultSchema = z.object({
  orderId: z.string().min(1),
  clientOrderId: z.string().optional(),
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  price: z.number().nonnegative(),
  amount: z.number().positive(),
  filled: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
  status: z.enum(['open', 'closed', 'canceled', 'rejected', 'expired']),
  fee: ExchangeOrderFeeSchema.optional(),
  timestamp: z.number().int().positive(),
});

export type ExchangeOrderResult = z.infer<typeof ExchangeOrderResultSchema>;

export const BalanceRecordSchema = z.object({
  free: z.number().nonnegative(),
  used: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export type BalanceRecord = z.infer<typeof BalanceRecordSchema>;

export const ExchangeBalanceSchema = z.record(z.string(), BalanceRecordSchema);

export type ExchangeBalance = z.infer<typeof ExchangeBalanceSchema>;

// ── Core Connector Interface ─────────────────────────────────────────────────

export interface IExchangeConnector {
  /** Canonical exchange venue identifier */
  readonly exchangeId: SupportedExchangeId | string;

  /**
   * Submit an order to the exchange.
   * Validates parameters with Zod, executes order, and returns normalized result.
   */
  placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult>;

  /**
   * Cancel an open order by ID and symbol.
   * Returns true if cancellation was confirmed, false if already terminal or not found.
   */
  cancelOrder(orderId: string, symbol: string): Promise<boolean>;

  /**
   * Fetch latest state of an existing order.
   */
  fetchOrder(orderId: string, symbol: string): Promise<ExchangeOrderResult>;

  /**
   * Query non-zero account balances across assets (free, used, total).
   */
  fetchBalance(): Promise<ExchangeBalance>;

  /**
   * Measure round-trip REST API latency in milliseconds.
   */
  getLatencyMs(): Promise<number>;
}

// ── Error Hierarchy ──────────────────────────────────────────────────────────

export class ExchangeConnectorError extends Error {
  readonly exchange: string;
  readonly code: string;

  constructor(message: string, exchange: string, code = 'EXCHANGE_ERROR') {
    super(`[${exchange}] ${message}`);
    this.name = 'ExchangeConnectorError';
    this.exchange = exchange;
    this.code = code;
  }
}

export class OrderPlacementError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'ORDER_PLACEMENT_FAILED');
    this.name = 'OrderPlacementError';
  }
}

export class OrderCancellationError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'ORDER_CANCELLATION_FAILED');
    this.name = 'OrderCancellationError';
  }
}

export class OrderNotFoundError extends ExchangeConnectorError {
  constructor(orderId: string, exchange: string) {
    super(`Order ${orderId} not found`, exchange, 'ORDER_NOT_FOUND');
    this.name = 'OrderNotFoundError';
  }
}

export class InsufficientBalanceError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'INSUFFICIENT_BALANCE');
    this.name = 'InsufficientBalanceError';
  }
}

export class ExchangeRateLimitError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'RATE_LIMIT_EXCEEDED');
    this.name = 'ExchangeRateLimitError';
  }
}

/** Alias for RateLimitExceededError to satisfy dispatch requirements */
export class RateLimitExceededError extends ExchangeRateLimitError {}

export class ExchangeNetworkError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'NETWORK_ERROR');
    this.name = 'ExchangeNetworkError';
  }
}

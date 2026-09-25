/**
 * CCXT Connector Mappers & Error Handlers
 * Converts raw CCXT order/balance payloads and standardizes error hierarchies.
 */

import {
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  type ExchangeOrderStatus,
  ExchangeConnectorError,
  OrderPlacementError,
  OrderCancellationError,
  OrderNotFoundError,
  InsufficientBalanceError,
  ExchangeRateLimitError,
  ExchangeNetworkError,
} from '../../arbitrage/connectors/types';
import {
  type SupportedCexExchange,
  type CcxtRawOrder,
} from './ccxt-connector-types';
import { logger } from '../../../shared/utils/logger';

export function mapCcxtStatus(status: string | null, filled: number, remaining: number): ExchangeOrderStatus {
  if (!status) {
    return remaining === 0 && filled > 0 ? 'closed' : 'open';
  }
  const s = status.toLowerCase();
  if (s === 'closed' || s === 'filled') return 'closed';
  if (s === 'canceled' || s === 'cancelled') return 'canceled';
  if (s === 'rejected') return 'rejected';
  if (s === 'expired') return 'expired';
  return 'open';
}

export function mapCcxtOrder(
  exchangeId: SupportedCexExchange,
  raw: CcxtRawOrder,
  originalParams?: ExchangeOrderParams
): ExchangeOrderResult {
  const amount = raw.amount ?? originalParams?.amount ?? 0;
  const filled = raw.filled ?? (raw.status === 'closed' ? amount : 0);
  const remaining = raw.remaining ?? Math.max(0, amount - filled);
  const price = raw.price ?? raw.average ?? originalParams?.price ?? 0;

  return {
    orderId: String(raw.id),
    clientOrderId: raw.clientOrderId ?? originalParams?.clientOrderId,
    exchange: exchangeId,
    symbol: raw.symbol ?? originalParams?.symbol ?? '',
    side: (raw.side ?? originalParams?.side ?? 'buy') as 'buy' | 'sell',
    price,
    amount,
    filled,
    remaining,
    status: mapCcxtStatus(raw.status, filled, remaining),
    fee:
      raw.fee?.cost !== undefined && raw.fee?.currency
        ? { amount: raw.fee.cost, currency: raw.fee.currency }
        : undefined,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

export function handleCcxtError(
  exchangeId: SupportedCexExchange,
  err: unknown,
  action: string,
  context?: Record<string, unknown>
): never {
  const errorMsg = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? (err.name || err.constructor.name) : 'UnknownError';
  const lower = errorMsg.toLowerCase();

  logger.error(`[${exchangeId}] ${action} failed: ${errorMsg}`, {
    exchange: exchangeId,
    action,
    errorName: errName,
    ...context,
  });

  if (
    errName === 'InsufficientFunds' ||
    lower.includes('insufficient') ||
    lower.includes('balance') ||
    lower.includes('not enough')
  ) {
    throw new InsufficientBalanceError(errorMsg, exchangeId);
  }
  if (
    errName === 'OrderNotFound' ||
    lower.includes('order not found') ||
    lower.includes('unknown order')
  ) {
    throw new OrderNotFoundError(String(context?.orderId ?? 'unknown'), exchangeId);
  }
  if (
    errName === 'RateLimitExceeded' ||
    errName === 'DDoSProtection' ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    throw new ExchangeRateLimitError(errorMsg, exchangeId);
  }
  if (
    errName === 'NetworkError' ||
    errName === 'RequestTimeout' ||
    errName === 'ExchangeNotAvailable' ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused')
  ) {
    throw new ExchangeNetworkError(errorMsg, exchangeId);
  }
  if (action === 'placeOrder') {
    throw new OrderPlacementError(errorMsg, exchangeId);
  }
  if (action === 'cancelOrder') {
    throw new OrderCancellationError(errorMsg, exchangeId);
  }

  throw new ExchangeConnectorError(errorMsg, exchangeId);
}

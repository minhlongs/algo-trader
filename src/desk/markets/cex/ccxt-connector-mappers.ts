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
  if (!status) return remaining === 0 && filled > 0 ? 'closed' : 'open';
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

  const errCode = (typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string')
    ? (err as { code: string }).code.toUpperCase()
    : '';

  const cause = typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause: unknown }).cause : undefined;
  const causeCode = (typeof cause === 'object' && cause !== null && 'code' in cause && typeof (cause as { code: unknown }).code === 'string')
    ? (cause as { code: string }).code.toUpperCase()
    : '';
  const causeMsg = cause instanceof Error
    ? cause.message.toLowerCase()
    : (typeof cause === 'object' && cause !== null && 'message' in cause && typeof (cause as { message: unknown }).message === 'string')
    ? (cause as { message: string }).message.toLowerCase()
    : '';

  logger.error(`[${exchangeId}] ${action} failed: ${errorMsg}`, {
    exchange: exchangeId,
    action,
    errorName: errName,
    errorCode: errCode || causeCode || undefined,
    ...context,
  });

  if (errName === 'InsufficientFunds' || lower.includes('insufficient') || lower.includes('balance') || lower.includes('not enough')) {
    throw new InsufficientBalanceError(errorMsg, exchangeId);
  }
  if (errName === 'OrderNotFound' || lower.includes('order not found') || lower.includes('unknown order') || lower.includes('order does not exist')) {
    throw new OrderNotFoundError(String(context?.orderId ?? 'unknown'), exchangeId);
  }
  if (errName === 'RateLimitExceeded' || errName === 'DDoSProtection' || lower.includes('rate limit') || lower.includes('too many requests')) {
    throw new ExchangeRateLimitError(errorMsg, exchangeId);
  }

  const combined = `${lower} ${causeMsg}`;
  const isNetCode = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ESOCKETTIMEDOUT'].includes(errCode) ||
    ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ESOCKETTIMEDOUT'].includes(causeCode) ||
    errCode.startsWith('UND_ERR_') || causeCode.startsWith('UND_ERR_');

  const isNetName = ['NetworkError', 'RequestTimeout', 'ExchangeNotAvailable', 'OnMaintenance', 'ConnectTimeout', 'TimeoutError', 'AbortError', 'FetchError'].includes(errName);

  const isNetMsg = combined.includes('network') || combined.includes('timeout') || combined.includes('timed out') || combined.includes('etimedout') ||
    combined.includes('econnreset') || combined.includes('connection reset') || combined.includes('econnrefused') || combined.includes('connection refused') ||
    combined.includes('socket hang up') || combined.includes('enotfound') || combined.includes('eai_again') || combined.includes('ehostunreach') ||
    combined.includes('enetunreach') || combined.includes('econnaborted') || combined.includes('epipe') || combined.includes('broken pipe') ||
    combined.includes('fetch failed') || combined.includes('connection closed') || combined.includes('closed connection') || combined.includes('socket closed') ||
    combined.includes('tls handshake') || combined.includes('ssl handshake');

  if (isNetCode || isNetName || isNetMsg) {
    throw new ExchangeNetworkError(errorMsg, exchangeId);
  }

  if (action === 'placeOrder') throw new OrderPlacementError(errorMsg, exchangeId);
  if (action === 'cancelOrder') throw new OrderCancellationError(errorMsg, exchangeId);
  throw new ExchangeConnectorError(errorMsg, exchangeId);
}

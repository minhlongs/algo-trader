/**
 * CCXT Error Classification
 *
 * Maps an unclassified CCXT/network failure onto the connector error hierarchy.
 * Extracted from the order/balance mappers so the signal-matching rules
 * (names, codes, message substrings) live in one place.
 */

import {
  ExchangeConnectorError,
  OrderPlacementError,
  OrderCancellationError,
  OrderNotFoundError,
  InsufficientBalanceError,
  ExchangeRateLimitError,
  ExchangeNetworkError,
} from '../../arbitrage/connectors/types';
import type { SupportedCexExchange } from './ccxt-connector-types';

/** Node/undici network error codes indicating a transport failure. */
const NETWORK_ERROR_CODES = [
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND',
  'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ESOCKETTIMEDOUT',
] as const;

/** CCXT exchange-state error names that mean the venue was reachable but unavailable. */
const NETWORK_ERROR_NAMES = [
  'NetworkError', 'RequestTimeout', 'ExchangeNotAvailable', 'OnMaintenance',
  'ConnectTimeout', 'TimeoutError', 'AbortError', 'FetchError',
] as const;

/** Message substrings (lowercased) that indicate a transport failure. */
const NETWORK_MESSAGE_MARKERS = [
  'network', 'timeout', 'timed out', 'etimedout', 'econnreset', 'connection reset',
  'econnrefused', 'connection refused', 'socket hang up', 'enotfound', 'eai_again',
  'ehostunreach', 'enetunreach', 'econnaborted', 'epipe', 'broken pipe',
  'fetch failed', 'connection closed', 'closed connection', 'socket closed',
  'tls handshake', 'ssl handshake',
] as const;

type ErrorLike = { name?: string; code?: unknown; cause?: unknown; message?: unknown };

/** Read a typed `cause` object off an unknown error. */
function readCause(err: unknown): ErrorLike | undefined {
  if (typeof err !== 'object' || err === null || !('cause' in err)) return undefined;
  return (err as ErrorLike).cause as ErrorLike | undefined;
}

/** Uppercased `code` string on an error or its cause, or '' when absent. */
function readErrorCode(obj: ErrorLike | undefined): string {
  if (!obj || typeof obj.code !== 'string') return '';
  return obj.code.toUpperCase();
}

/** Lowercased message text of an error or its cause, or '' when absent. */
function readMessage(obj: ErrorLike | undefined): string {
  if (!obj || typeof obj.message !== 'string') return '';
  return obj.message.toLowerCase();
}

/** True when the error text says the order was already gone before we acted. */
export function isBenignCancelError(err: unknown): boolean {
  const lower = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    lower.includes('order not found') ||
    lower.includes('unknown order') ||
    lower.includes('order does not exist') ||
    lower.includes('already closed')
  );
}

/**
 * Throw the connector error matching `err`, or a generic connector error.
 *
 * Classification order follows operational priority: balance problems (the
 * caller must stop trading), then missing orders, then rate limits, then
 * transport failures, then the action-specific fallback.
 */
export function throwClassifiedCcxtError(
  exchangeId: SupportedCexExchange,
  err: unknown,
  action: string,
  errorMsg: string,
  errName: string,
  context?: Record<string, unknown>,
): never {
  const lower = errorMsg.toLowerCase();
  const cause = readCause(err);
  const causeCode = readErrorCode(cause);
  const causeMsg = readMessage(cause);

  if (errName === 'InsufficientFunds' || lower.includes('insufficient') || lower.includes('balance') || lower.includes('not enough')) {
    throw new InsufficientBalanceError(errorMsg, exchangeId);
  }
  if (errName === 'OrderNotFound' || lower.includes('order not found') || lower.includes('unknown order') || lower.includes('order does not exist')) {
    throw new OrderNotFoundError(String(context?.orderId ?? 'unknown'), exchangeId);
  }
  if (errName === 'RateLimitExceeded' || errName === 'DDoSProtection' || lower.includes('rate limit') || lower.includes('too many requests')) {
    throw new ExchangeRateLimitError(errorMsg, exchangeId);
  }

  const errCode = readErrorCode(err as ErrorLike | undefined);
  const combined = `${lower} ${causeMsg}`;
  const isNetCode = NETWORK_ERROR_CODES.includes(errCode as (typeof NETWORK_ERROR_CODES)[number]) ||
    NETWORK_ERROR_CODES.includes(causeCode as (typeof NETWORK_ERROR_CODES)[number]) ||
    errCode.startsWith('UND_ERR_') || causeCode.startsWith('UND_ERR_');

  const isNetName = NETWORK_ERROR_NAMES.includes(errName as (typeof NETWORK_ERROR_NAMES)[number]);

  const isNetMsg = NETWORK_MESSAGE_MARKERS.some((marker) => combined.includes(marker));

  if (isNetCode || isNetName || isNetMsg) {
    throw new ExchangeNetworkError(errorMsg, exchangeId);
  }

  if (action === 'placeOrder') throw new OrderPlacementError(errorMsg, exchangeId);
  if (action === 'cancelOrder') throw new OrderCancellationError(errorMsg, exchangeId);
  throw new ExchangeConnectorError(errorMsg, exchangeId);
}

/** Context logged alongside a CCXT failure for post-mortem correlation. */
export interface CcxtErrorLogContext {
  exchange: SupportedCexExchange;
  action: string;
  errorName: string;
  errorCode?: string;
  [key: string]: unknown;
}

/** Build the structured log context for a CCXT failure. */
export function buildCcxtErrorLogContext(
  exchangeId: SupportedCexExchange,
  action: string,
  errName: string,
  errorCode: string,
  causeCode: string,
  context?: Record<string, unknown>,
): CcxtErrorLogContext {
  return {
    exchange: exchangeId,
    action,
    errorName: errName,
    errorCode: errorCode || causeCode || undefined,
    ...context,
  };
}

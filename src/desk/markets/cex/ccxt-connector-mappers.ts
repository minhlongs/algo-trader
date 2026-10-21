/**
 * CCXT Connector Mappers & Error Handlers
 * Converts raw CCXT order/balance payloads and standardizes error hierarchies.
 *
 * Split: payload mapping lives here; error classification lives in
 * ccxt-error-classifier.ts (signal table, error hierarchy, log context).
 */

import {
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  type ExchangeOrderStatus,
  type ExchangeBalance,
} from '../../arbitrage/connectors/types';
import {
  type SupportedCexExchange,
  type CcxtRawOrder,
  type CcxtRawBalance,
} from './ccxt-connector-types';
import { logger } from '../../../shared/utils/logger';
import {
  buildCcxtErrorLogContext,
  isBenignCancelError,
  throwClassifiedCcxtError,
} from './ccxt-error-classifier';

export { isBenignCancelError };

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

export function mapCcxtBalance(raw: CcxtRawBalance): ExchangeBalance {
  const balance: ExchangeBalance = {};
  const assets = new Set<string>([
    ...Object.keys(raw.total ?? {}),
    ...Object.keys(raw.free ?? {}),
    ...Object.keys(raw.used ?? {}),
  ]);

  for (const asset of assets) {
    const free = raw.free?.[asset] ?? 0;
    const used = raw.used?.[asset] ?? 0;
    const total = raw.total?.[asset] ?? free + used;
    if (total > 0 || free > 0 || used > 0) {
      balance[asset] = { free, used, total };
    }
  }
  return balance;
}

export function handleCcxtError(
  exchangeId: SupportedCexExchange,
  err: unknown,
  action: string,
  context?: Record<string, unknown>
): never {
  const errorMsg = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? (err.name || err.constructor.name) : 'UnknownError';

  const errCode = typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code.toUpperCase()
    : '';
  const cause = typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause: unknown }).cause : undefined;
  const causeCode = typeof cause === 'object' && cause !== null && 'code' in cause && typeof (cause as { code: unknown }).code === 'string'
    ? (cause as { code: string }).code.toUpperCase()
    : '';

  logger.error(
    `[${exchangeId}] ${action} failed: ${errorMsg}`,
    buildCcxtErrorLogContext(exchangeId, action, errName, errCode, causeCode, context),
  );

  throwClassifiedCcxtError(exchangeId, err, action, errorMsg, errName, context);
}

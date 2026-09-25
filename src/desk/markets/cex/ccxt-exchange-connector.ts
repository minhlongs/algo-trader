/**
 * Unified CCXT Exchange Connector
 * Provides uniform order execution, cancellation, order polling, balance fetching,
 * and latency measurement across Binance, Bybit, and KuCoin.
 */

import {
  type IExchangeConnector,
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  type ExchangeBalance,
  ExchangeOrderParamsSchema,
  ExchangeConnectorError,
  OrderPlacementError,
  OrderCancellationError,
  OrderNotFoundError,
  InsufficientBalanceError,
  ExchangeRateLimitError,
  ExchangeNetworkError,
} from '../../arbitrage/connectors/types';
import { logger } from '../../../shared/utils/logger';
import {
  type SupportedCexExchange,
  type CcxtExchangeAdapter,
  type CcxtExchangeConnectorOptions,
} from './ccxt-connector-types';
import { createCcxtExchange } from './ccxt-connector-factory';
import {
  mapCcxtOrder,
  mapCcxtStatus,
} from './ccxt-connector-mappers';

export * from './ccxt-connector-types';
export * from './ccxt-connector-factory';
export { mapCcxtStatus, mapCcxtOrder };

export class CcxtExchangeConnector implements IExchangeConnector {
  readonly exchangeId: SupportedCexExchange;
  private readonly adapter: CcxtExchangeAdapter;

  constructor(
    exchangeId: SupportedCexExchange,
    adapter?: CcxtExchangeAdapter,
    options?: CcxtExchangeConnectorOptions
  ) {
    this.exchangeId = exchangeId;

    if (exchangeId === 'kucoin' && !adapter) {
      const prefix = exchangeId.toUpperCase();
      const pwd =
        options?.password ?? process.env[`${prefix}_API_PASSPHRASE`] ?? process.env[`${prefix}_PASSPHRASE`];
      if (options?.apiKey && !pwd) {
        throw new ExchangeConnectorError(
          'KuCoin requires an API passphrase (password) when API credentials are provided',
          exchangeId,
          'MISSING_CREDENTIALS'
        );
      }
    }

    this.adapter = adapter ?? createCcxtExchange(exchangeId, options);
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    const validated = ExchangeOrderParamsSchema.parse(params);
    const extraParams: Record<string, unknown> = {};

    if (validated.clientOrderId) {
      extraParams.clientOrderId = validated.clientOrderId;
    }
    if (this.exchangeId === 'bybit') {
      extraParams.category = 'spot';
    }

    try {
      const raw = await this.adapter.createOrder(
        validated.symbol,
        validated.type,
        validated.side,
        validated.amount,
        validated.price,
        extraParams
      );

      return mapCcxtOrder(this.exchangeId, raw, validated);
    } catch (err) {
      handleCcxtError(this.exchangeId, err, 'placeOrder', { symbol: validated.symbol, side: validated.side });
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    if (!orderId || !symbol) {
      throw new OrderCancellationError('orderId and symbol are required to cancel order', this.exchangeId);
    }

    const extraParams: Record<string, unknown> = {};
    if (this.exchangeId === 'bybit') {
      extraParams.category = 'spot';
    }

    try {
      await this.adapter.cancelOrder(orderId, symbol, extraParams);
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const lower = errMsg.toLowerCase();
      if (
        lower.includes('order not found') ||
        lower.includes('unknown order') ||
        lower.includes('order does not exist') ||
        lower.includes('already closed')
      ) {
        logger.warn(`[${this.exchangeId}] cancelOrder: order ${orderId} already closed or not found`, {
          orderId,
          symbol,
        });
        return false;
      }
      handleCcxtError(this.exchangeId, err, 'cancelOrder', { orderId, symbol });
    }
  }

  async fetchOrder(orderId: string, symbol: string): Promise<ExchangeOrderResult> {
    if (!orderId || !symbol) {
      throw new OrderNotFoundError('orderId and symbol are required', this.exchangeId);
    }

    const extraParams: Record<string, unknown> = {};
    if (this.exchangeId === 'bybit') {
      extraParams.category = 'spot';
    }

    try {
      const raw = await this.adapter.fetchOrder(orderId, symbol, extraParams);
      return mapCcxtOrder(this.exchangeId, raw);
    } catch (err) {
      handleCcxtError(this.exchangeId, err, 'fetchOrder', { orderId, symbol });
    }
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    try {
      const raw = await this.adapter.fetchBalance();
      const balance: ExchangeBalance = {};

      const assets = new Set<string>([
        ...Object.keys(raw.total ?? {}),
        ...Object.keys(raw.free ?? {}),
        ...Object.keys(raw.used ?? {}),
      ]);

      for (const asset of assets) {
        const free = raw.free?.[asset] ?? 0;
        const used = raw.used?.[asset] ?? 0;
        const total = raw.total?.[asset] ?? (free + used);

        if (total > 0 || free > 0 || used > 0) {
          balance[asset] = { free, used, total };
        }
      }

      return balance;
    } catch (err) {
      handleCcxtError(this.exchangeId, err, 'fetchBalance');
    }
  }

  async getLatencyMs(): Promise<number> {
    const start = Date.now();
    try {
      if (typeof this.adapter.fetchTime === 'function') {
        await this.adapter.fetchTime();
      } else if (typeof this.adapter.fetchStatus === 'function') {
        await this.adapter.fetchStatus();
      } else {
        await this.adapter.fetchBalance();
      }
      return Math.max(0, Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${this.exchangeId}] getLatencyMs check degraded: ${msg}`);
      return Math.max(0, Date.now() - start);
    }
  }
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

  const errCode =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code.toUpperCase()
      : '';

  const cause =
    typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause: unknown }).cause : undefined;

  const causeCode =
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof (cause as { code: unknown }).code === 'string'
      ? (cause as { code: string }).code.toUpperCase()
      : '';

  const causeMsg =
    cause instanceof Error
      ? cause.message.toLowerCase()
      : typeof cause === 'object' &&
        cause !== null &&
        'message' in cause &&
        typeof (cause as { message: unknown }).message === 'string'
      ? (cause as { message: string }).message.toLowerCase()
      : '';

  logger.error(`[${exchangeId}] ${action} failed: ${errorMsg}`, {
    exchange: exchangeId,
    action,
    errorName: errName,
    errorCode: errCode || causeCode || undefined,
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
    lower.includes('unknown order') ||
    lower.includes('order does not exist')
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

  const combinedMsg = `${lower} ${causeMsg}`;
  const isNetworkCode =
    errCode === 'ETIMEDOUT' ||
    errCode === 'ECONNRESET' ||
    errCode === 'ECONNREFUSED' ||
    errCode === 'ECONNABORTED' ||
    errCode === 'ENOTFOUND' ||
    errCode === 'EAI_AGAIN' ||
    errCode === 'EHOSTUNREACH' ||
    errCode === 'ENETUNREACH' ||
    errCode === 'EPIPE' ||
    errCode === 'ESOCKETTIMEDOUT' ||
    errCode.startsWith('UND_ERR_') ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ECONNABORTED' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'EAI_AGAIN' ||
    causeCode === 'EHOSTUNREACH' ||
    causeCode === 'ENETUNREACH' ||
    causeCode === 'EPIPE' ||
    causeCode === 'ESOCKETTIMEDOUT' ||
    causeCode.startsWith('UND_ERR_');

  const isNetworkName =
    errName === 'NetworkError' ||
    errName === 'RequestTimeout' ||
    errName === 'ExchangeNotAvailable' ||
    errName === 'OnMaintenance' ||
    errName === 'ConnectTimeout' ||
    errName === 'TimeoutError' ||
    errName === 'AbortError' ||
    errName === 'FetchError';

  const isNetworkMessage =
    combinedMsg.includes('network') ||
    combinedMsg.includes('timeout') ||
    combinedMsg.includes('timed out') ||
    combinedMsg.includes('etimedout') ||
    combinedMsg.includes('econnreset') ||
    combinedMsg.includes('connection reset') ||
    combinedMsg.includes('econnrefused') ||
    combinedMsg.includes('connection refused') ||
    combinedMsg.includes('socket hang up') ||
    combinedMsg.includes('enotfound') ||
    combinedMsg.includes('eai_again') ||
    combinedMsg.includes('ehostunreach') ||
    combinedMsg.includes('enetunreach') ||
    combinedMsg.includes('econnaborted') ||
    combinedMsg.includes('epipe') ||
    combinedMsg.includes('broken pipe') ||
    combinedMsg.includes('fetch failed') ||
    combinedMsg.includes('connection closed') ||
    combinedMsg.includes('closed connection') ||
    combinedMsg.includes('socket closed') ||
    combinedMsg.includes('tls handshake') ||
    combinedMsg.includes('ssl handshake');

  if (isNetworkCode || isNetworkName || isNetworkMessage) {
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


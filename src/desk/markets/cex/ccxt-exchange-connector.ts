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
  OrderCancellationError,
  OrderNotFoundError,
} from '../../arbitrage/connectors/types';
import { logger } from '../../../shared/utils/logger';
import {
  type SupportedCexExchange,
  type CcxtExchangeAdapter,
  type CcxtExchangeConnectorOptions,
} from './ccxt-connector-types';
import {
  createCcxtExchange,
  validateKucoinPassphrase,
  buildSpotExtraParams,
} from './ccxt-connector-factory';
import {
  mapCcxtOrder,
  mapCcxtStatus,
  mapCcxtBalance,
  isBenignCancelError,
  handleCcxtError,
} from './ccxt-connector-mappers';

export * from './ccxt-connector-types';
export * from './ccxt-connector-factory';
export { mapCcxtStatus, mapCcxtOrder, mapCcxtBalance, isBenignCancelError, handleCcxtError };

export class CcxtExchangeConnector implements IExchangeConnector {
  readonly exchangeId: SupportedCexExchange;
  private readonly adapter: CcxtExchangeAdapter;

  constructor(
    exchangeId: SupportedCexExchange,
    adapter?: CcxtExchangeAdapter,
    options?: CcxtExchangeConnectorOptions
  ) {
    this.exchangeId = exchangeId;
    validateKucoinPassphrase(exchangeId, adapter, options);
    this.adapter = adapter ?? createCcxtExchange(exchangeId, options);
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    const validated = ExchangeOrderParamsSchema.parse(params);
    const extraParams = buildSpotExtraParams(this.exchangeId, validated.clientOrderId);

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

    const extraParams = buildSpotExtraParams(this.exchangeId);

    try {
      await this.adapter.cancelOrder(orderId, symbol, extraParams);
      return true;
    } catch (err) {
      if (isBenignCancelError(err)) {
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

    const extraParams = buildSpotExtraParams(this.exchangeId);

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
      return mapCcxtBalance(raw);
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

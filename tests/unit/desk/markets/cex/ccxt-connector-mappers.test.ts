import { describe, it, expect } from 'vitest';
import {
  mapCcxtStatus,
  mapCcxtOrder,
  handleCcxtError,
} from '../../../../../src/desk/markets/cex/ccxt-connector-mappers';
import {
  InsufficientBalanceError,
  OrderNotFoundError,
  ExchangeRateLimitError,
  ExchangeNetworkError,
  OrderPlacementError,
  OrderCancellationError,
  ExchangeConnectorError,
} from '../../../../../src/desk/arbitrage/connectors/types';
import type { CcxtRawOrder } from '../../../../../src/desk/markets/cex/ccxt-connector-types';

describe('CCXT Connector Mappers & Error Handling', () => {
  describe('mapCcxtStatus', () => {
    it('maps null or empty status based on remaining and filled amounts', () => {
      expect(mapCcxtStatus(null, 1.0, 0)).toBe('closed');
      expect(mapCcxtStatus(null, 0, 1.0)).toBe('open');
      expect(mapCcxtStatus('', 0.5, 0)).toBe('closed');
    });

    it('maps standard status strings to ExchangeOrderStatus', () => {
      expect(mapCcxtStatus('closed', 1, 0)).toBe('closed');
      expect(mapCcxtStatus('FILLED', 1, 0)).toBe('closed');
      expect(mapCcxtStatus('canceled', 0, 1)).toBe('canceled');
      expect(mapCcxtStatus('cancelled', 0, 1)).toBe('canceled');
      expect(mapCcxtStatus('rejected', 0, 1)).toBe('rejected');
      expect(mapCcxtStatus('expired', 0, 1)).toBe('expired');
      expect(mapCcxtStatus('custom_open_state', 0, 1)).toBe('open');
    });
  });

  describe('mapCcxtOrder', () => {
    it('maps raw CCXT order with explicit fees and timestamps', () => {
      const raw: CcxtRawOrder = {
        id: 'ord-999',
        clientOrderId: 'client-ord-999',
        symbol: 'BTC/USDT',
        side: 'buy',
        price: 50000,
        amount: 2.0,
        filled: 2.0,
        remaining: 0,
        status: 'closed',
        fee: { cost: 5.0, currency: 'USDT' },
        timestamp: 1700000000000,
      };

      const result = mapCcxtOrder('binance', raw);
      expect(result.orderId).toBe('ord-999');
      expect(result.clientOrderId).toBe('client-ord-999');
      expect(result.exchange).toBe('binance');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.price).toBe(50000);
      expect(result.amount).toBe(2.0);
      expect(result.filled).toBe(2.0);
      expect(result.remaining).toBe(0);
      expect(result.status).toBe('closed');
      expect(result.fee).toEqual({ amount: 5.0, currency: 'USDT' });
      expect(result.timestamp).toBe(1700000000000);
    });

    it('uses fallback values from originalParams when raw fields are missing', () => {
      const raw: CcxtRawOrder = {
        id: 12345,
        status: 'open',
      };

      const params = {
        symbol: 'ETH/USDT',
        side: 'sell' as const,
        amount: 1.5,
        price: 3000,
        clientOrderId: 'fallback-client-id',
      };

      const result = mapCcxtOrder('bybit', raw, params);
      expect(result.orderId).toBe('12345');
      expect(result.clientOrderId).toBe('fallback-client-id');
      expect(result.symbol).toBe('ETH/USDT');
      expect(result.side).toBe('sell');
      expect(result.amount).toBe(1.5);
      expect(result.price).toBe(3000);
      expect(result.filled).toBe(0);
      expect(result.remaining).toBe(1.5);
      expect(result.fee).toBeUndefined();
    });
  });

  describe('handleCcxtError', () => {
    it('throws InsufficientBalanceError on InsufficientFunds or balance keywords', () => {
      const err = new Error('Account has insufficient balance for trade');
      err.name = 'InsufficientFunds';

      expect(() => handleCcxtError('binance', err, 'placeOrder')).toThrow(InsufficientBalanceError);
    });

    it('throws OrderNotFoundError on OrderNotFound or unknown order message', () => {
      const err = new Error('Order does not exist on venue');
      err.name = 'OrderNotFound';

      expect(() => handleCcxtError('okx', err, 'cancelOrder', { orderId: 'ord-123' })).toThrow(
        OrderNotFoundError
      );
    });

    it('throws ExchangeRateLimitError on rate limit exceeded or DDoSProtection', () => {
      const err = new Error('Too many requests sent to API');
      err.name = 'RateLimitExceeded';

      expect(() => handleCcxtError('bybit', err, 'fetchOrderBook')).toThrow(
        ExchangeRateLimitError
      );
    });

    it('throws ExchangeNetworkError on network error codes or cause objects', () => {
      const err = {
        message: 'Socket error',
        code: 'ECONNRESET',
      };
      expect(() => handleCcxtError('binance', err, 'placeOrder')).toThrow(ExchangeNetworkError);

      const errWithCause = {
        message: 'Request failed',
        cause: { code: 'ETIMEDOUT', message: 'connection timed out' },
      };
      expect(() => handleCcxtError('binance', errWithCause, 'placeOrder')).toThrow(
        ExchangeNetworkError
      );

      const errWithUndici = {
        message: 'Fetch failed',
        code: 'UND_ERR_CONNECT_TIMEOUT',
      };
      expect(() => handleCcxtError('binance', errWithUndici, 'fetchTicker')).toThrow(
        ExchangeNetworkError
      );
    });

    it('throws ExchangeNetworkError on network error names', () => {
      const err = new Error('Fetch aborted due to network timeout');
      err.name = 'RequestTimeout';

      expect(() => handleCcxtError('bybit', err, 'placeOrder')).toThrow(ExchangeNetworkError);
    });

    it('throws specific action errors (OrderPlacementError, OrderCancellationError)', () => {
      const placeErr = new Error('Invalid price precision');
      expect(() => handleCcxtError('binance', placeErr, 'placeOrder')).toThrow(OrderPlacementError);

      const cancelErr = new Error('Order cannot be cancelled in current state');
      expect(() => handleCcxtError('binance', cancelErr, 'cancelOrder')).toThrow(
        OrderCancellationError
      );
    });

    it('throws general ExchangeConnectorError as fallback', () => {
      const genErr = new Error('General exchange failure');
      expect(() => handleCcxtError('binance', genErr, 'fetchBalance')).toThrow(
        ExchangeConnectorError
      );
    });
  });
});

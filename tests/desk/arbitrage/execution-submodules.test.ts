/**
 * Unit tests for Arbitrage Execution submodules: batch executor, single leg executor, and unwind orchestrators.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeConcurrentLegs,
  executeSequentialLegs,
} from '../../../src/desk/arbitrage/execution/multileg-batch-executor';
import {
  executeSingleLegWithTimeout,
  cancelOpenLegs,
} from '../../../src/desk/arbitrage/execution/multileg-single-leg-executor';
import {
  buildUnwindFailureReport,
  buildUnwindSuccessReport,
  handleMissingConnector,
} from '../../../src/desk/arbitrage/execution/compensatory-unwind-order';
import {
  normalizeUnwindRequest,
} from '../../../src/desk/arbitrage/execution/compensatory-unwind-parser';
import { EventEmitter } from 'node:events';
import type { LegOrderParams, LegExecutionReport } from '../../../src/desk/arbitrage/execution-types';

describe('Arbitrage Execution Submodules', () => {
  describe('multileg-single-leg-executor', () => {
    it('executes single leg when connector succeeds', async () => {
      const mockConn = {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'order-123',
          clientOrderId: 'client-123',
          filled: 1.0,
          remaining: 0,
          price: 50000,
          status: 'closed',
          fee: { amount: 5, currency: 'USDT' },
        }),
      };
      const resolver = () => mockConn as any;
      const leg: LegOrderParams = {
        legId: 'leg-1',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        type: 'limit',
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 1000);
      expect(res.status).toBe('filled');
      expect(res.filledAmount).toBe(1.0);
      expect(res.orderId).toBe('order-123');
    });

    it('handles market orders and closed status with zero filled in result', async () => {
      const mockConn = {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'order-mkt',
          filled: 0, // 0 filled returned by connector
          remaining: 0,
          price: 0, // 0 price returned by connector -> fallback to leg price
          status: 'closed',
        }),
      };
      const resolver = () => mockConn as any;
      const leg: LegOrderParams = {
        legId: 'leg-mkt',
        clientOrderId: 'custom-client-id',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 2.0,
        price: 51000,
        type: 'market',
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 1000);
      expect(res.status).toBe('filled');
      expect(res.filledAmount).toBe(2.0);
      expect(res.price).toBe(51000);
      expect(res.clientOrderId).toBe('custom-client-id');
    });

    it('handles non-Error thrown during order placement', async () => {
      const mockConn = {
        placeOrder: vi.fn().mockRejectedValue('Raw string network error'),
      };
      const resolver = () => mockConn as any;
      const leg: LegOrderParams = {
        legId: 'leg-err',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        type: 'limit',
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 1000);
      expect(res.status).toBe('failed');
      expect(res.error).toBe('Raw string network error');
    });

    it('cancels open orders with mixed statuses and connectors', async () => {
      const mockCancel = vi.fn().mockResolvedValue(true);
      const mockConn = { cancelOrder: mockCancel };
      const resolver = (venue: string) => (venue === 'binance' ? mockConn as any : undefined);

      const legs: LegExecutionReport[] = [
        // Valid partial order
        { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 0.5, remainingAmount: 0.5, price: 50000, status: 'partial', orderId: 'ord-1', latencyMs: 10 },
        // Valid pending order
        { legId: 'leg-2', venue: 'binance', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 0, remainingAmount: 1, price: 50200, status: 'pending', orderId: 'ord-2', latencyMs: 10 },
        // Filled order (should be skipped)
        { legId: 'leg-3', venue: 'binance', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 1, remainingAmount: 0, price: 50200, status: 'filled', orderId: 'ord-3', latencyMs: 10 },
        // Missing orderId (should be skipped)
        { legId: 'leg-4', venue: 'binance', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 0, remainingAmount: 1, price: 50200, status: 'submitted', latencyMs: 10 },
        // Missing connector (should be skipped)
        { legId: 'leg-5', venue: 'unknown_venue', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 0, remainingAmount: 1, price: 50200, status: 'submitted', orderId: 'ord-5', latencyMs: 10 },
      ];

      await expect(cancelOpenLegs(resolver, legs)).resolves.not.toThrow();
      expect(mockCancel).toHaveBeenCalledTimes(2);
    });

    it('handles aborted signal prior to submission', async () => {
      const controller = new AbortController();
      controller.abort();

      const resolver = () => ({} as any);
      const leg: LegOrderParams = {
        legId: 'leg-abort',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        type: 'limit',
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 1000, controller.signal);
      expect(res.status).toBe('canceled');
      expect(res.error).toContain('Aborted prior');
    });

    it('handles missing connector gracefully with failed report', async () => {
      const resolver = () => undefined;
      const leg: LegOrderParams = {
        legId: 'leg-2',
        venue: 'unknown_venue',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        type: 'limit',
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 1000);
      expect(res.status).toBe('failed');
      expect(res.error).toContain('No connector');
    });

    it('handles leg timeout gracefully with timed_out status', async () => {
      const mockConn = {
        placeOrder: () => new Promise(() => {}), // never resolves
      };
      const resolver = () => mockConn as any;
      const leg: LegOrderParams = {
        legId: 'leg-timeout',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        type: 'limit',
        timeoutMs: 20,
      };

      const res = await executeSingleLegWithTimeout(resolver, leg, 20);
      expect(res.status).toBe('timed_out');
      expect(res.error).toContain('LEG_TIMEOUT');
    });

    it('cancels open orders without throwing and handles connector errors', async () => {
      const mockCancel = vi.fn().mockRejectedValue(new Error('Cancel failed'));
      const mockConn = { cancelOrder: mockCancel };
      const resolver = () => mockConn as any;

      const legs: LegExecutionReport[] = [
        { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 0.5, remainingAmount: 0.5, price: 50000, status: 'partial', orderId: 'ord-1', latencyMs: 10 },
        { legId: 'leg-2', venue: 'binance', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 0, remainingAmount: 1, price: 50200, status: 'submitted', orderId: 'ord-2', latencyMs: 10 },
      ];

      await expect(cancelOpenLegs(resolver, legs)).resolves.not.toThrow();
      expect(mockCancel).toHaveBeenCalled();
    });
  });

  describe('multileg-batch-executor', () => {
    it('executes concurrent legs in parallel with error handling', async () => {
      const mockConn = {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'ord',
          filled: 1.0,
          price: 100,
          status: 'closed',
        }),
      };
      const resolver = (venue: string) => {
        if (venue === 'error_venue') return undefined;
        return mockConn as any;
      };
      const legs: LegOrderParams[] = [
        { legId: 'leg-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 100, type: 'limit' },
        { legId: 'leg-2', venue: 'error_venue', symbol: 'ETH/USDT', side: 'sell', amount: 1, price: 101, type: 'limit' },
      ];

      const reports = await executeConcurrentLegs(resolver, legs, 1000, new AbortController().signal);
      expect(reports).toHaveLength(2);
      expect(reports[0].status).toBe('filled');
      expect(reports[1].status).toBe('failed');
    });

    it('executes sequential legs stopping on first failure or abort', async () => {
      const mockConn = {
        placeOrder: vi.fn().mockRejectedValueOnce(new Error('Network error')),
      };
      const resolver = () => mockConn as any;
      const legs: LegOrderParams[] = [
        { legId: 'leg-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 100, type: 'limit' },
        { legId: 'leg-2', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', amount: 1, price: 101, type: 'limit' },
      ];

      const reports = await executeSequentialLegs(resolver, legs, 1000, new AbortController().signal);
      expect(reports).toHaveLength(1);
      expect(reports[0].status).toBe('failed');

      // Test with pre-aborted controller
      const controller = new AbortController();
      controller.abort();
      const abortedReports = await executeSequentialLegs(resolver, legs, 1000, controller.signal);
      expect(abortedReports).toHaveLength(1);
      expect(abortedReports[0].status).toBe('canceled');
    });
  });

  describe('compensatory-unwind-parser & order helpers', () => {
    it('normalizes string executionId and legacy legs', () => {
      const legs: LegExecutionReport[] = [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, remainingAmount: 0, price: 50000, status: 'filled', latencyMs: 5 },
      ];
      const req = normalizeUnwindRequest('exec-99', legs, 'Leg 2 failed');
      expect(req.executionId).toBe('exec-99');
      expect(req.legsToUnwind).toHaveLength(1);
      expect(req.legsToUnwind[0].filledAmount).toBe(1);
    });

    it('builds unwind success and failure reports', () => {
      const fail = buildUnwindFailureReport({
        legId: 'l1',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,
        entryPrice: 50000,
        latencyMs: 10,
        error: 'Order failed',
      });
      expect(fail.status).toBe('failed');

      const succ = buildUnwindSuccessReport({
        legId: 'l1',
        venue: 'binance',
        symbol: 'BTC/USDT',
        unwindSide: 'sell',
        requestedAmount: 1,
        filledAmount: 1,
        remainingAmount: 0,
        execPrice: 49950,
        latencyMs: 12,
      });
      expect(succ.status).toBe('filled');
    });

    it('handles missing connector during unwind', () => {
      const emitter = new EventEmitter();
      const target = {
        legId: 'l1',
        venue: 'unregistered',
        symbol: 'ETH/USDT',
        side: 'buy' as const,
        filledAmount: 2,
        entryPrice: 2000,
      };
      const res = handleMissingConnector(target, 'u1', 'e1', Date.now(), emitter);
      expect(res.residualDelta).toBe(2);
      expect(res.unwoundLegs[0].status).toBe('failed');
    });
  });
});

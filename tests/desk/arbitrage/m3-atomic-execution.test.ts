/**
 * Milestone 3 Comprehensive Test Suite:
 * Atomic Multi-Leg Order Execution & Partial-Fill Compensatory Unwind (Requirement R2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AtomicMultiLegCoordinator,
  type CoordinatorOptions,
} from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import {
  CompensatoryUnwindHandler,
} from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import {
  type MultiLegArbitrageOrder,
  type LegOrderParams,
  type LegExecutionReport,
  type ExecutionState,
  calculateMultiLegRealizedPnl,
  ExecutionStateSchema,
  LegOrderParamsSchema,
  MultiLegArbitrageOrderSchema,
  LegExecutionReportSchema,
  CompensatoryUnwindRequestSchema,
  UnwindResultSchema,
  MultiLegExecutionReportSchema,
} from '../../../src/desk/arbitrage/execution-types';
import {
  ArbitrageRiskGuard,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import type {
  IExchangeConnector,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeBalance,
} from '../../../src/desk/arbitrage/connectors/types';

describe('Milestone 3: Atomic Multi-Leg Order Execution & Compensatory Unwind (R2)', () => {
  // Helper to create fully typed mock connectors
  const createMockConnector = (
    exchangeId: string,
    overrides?: Partial<IExchangeConnector>,
  ): IExchangeConnector => {
    return {
      exchangeId,
      placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
        orderId: `ord-${exchangeId}-${Date.now()}`,
        clientOrderId: params.clientOrderId,
        exchange: exchangeId,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 50000,
        amount: params.amount,
        filled: params.amount,
        remaining: 0,
        status: 'closed',
        fee: { amount: 1.5, currency: 'USDT' },
        timestamp: Date.now(),
      })),
      cancelOrder: vi.fn(async () => true),
      fetchOrder: vi.fn(async () => ({
        orderId: 'mock',
        exchange: exchangeId,
        symbol: 'BTC/USDT',
        side: 'buy',
        price: 50000,
        amount: 1,
        filled: 1,
        remaining: 0,
        status: 'closed',
        timestamp: Date.now(),
      })),
      fetchBalance: vi.fn(async (): Promise<ExchangeBalance> => ({
        USDT: { free: 100000, used: 0, total: 100000 },
        BTC: { free: 10, used: 0, total: 10 },
      })),
      getLatencyMs: vi.fn(async () => 15),
      ...overrides,
    };
  };

  describe('1. Concurrent Execution & State Machine', () => {
    it('executes all legs concurrently, fills 100%, and transitions PENDING -> SUBMITTED -> FILLED', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'binance-fill-1',
          clientOrderId: params.clientOrderId,
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: 1,
          filled: 1,
          remaining: 0,
          status: 'closed',
          fee: { amount: 5, currency: 'USDT' },
          timestamp: Date.now(),
        })),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'bybit-fill-1',
          clientOrderId: params.clientOrderId,
          exchange: 'bybit',
          symbol: params.symbol,
          side: params.side,
          price: 50250,
          amount: 1,
          filled: 1,
          remaining: 0,
          status: 'closed',
          fee: { amount: 5, currency: 'USDT' },
          timestamp: Date.now(),
        })),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-concurrent-101',
        opportunityId: 'opp-101',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50250 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('FILLED');
      expect(report.legs.length).toBe(2);
      expect(report.legs.every((l) => l.status === 'filled')).toBe(true);

      // Verify net realized PnL: sell (50250 - 5) - buy (50000 + 5) = 50245 - 50005 = 240
      expect(report.netRealizedPnlUsd).toBe(240);
      expect(report.unwindResult).toBeUndefined();

      // Verify formal 6-state lifecycle transitions
      expect(report.stateHistory.length).toBe(2);
      expect(report.stateHistory[0].from).toBe('PENDING');
      expect(report.stateHistory[0].to).toBe('SUBMITTED');
      expect(report.stateHistory[1].from).toBe('SUBMITTED');
      expect(report.stateHistory[1].to).toBe('FILLED');
    });

    it('coordinates multi-venue 3-leg trade across Polymarket CLOB, Binance, and KuCoin', async () => {
      const mockPoly = createMockConnector('polymarket', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'poly-1',
          clientOrderId: params.clientOrderId,
          exchange: 'polymarket',
          symbol: params.symbol,
          side: params.side,
          price: 0.52,
          amount: 1000,
          filled: 1000,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'binance-1',
          clientOrderId: params.clientOrderId,
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: 0.01,
          filled: 0.01,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'kucoin-1',
          clientOrderId: params.clientOrderId,
          exchange: 'kucoin',
          symbol: params.symbol,
          side: params.side,
          price: 50100,
          amount: 0.01,
          filled: 0.01,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      const resolver = (venue: string) => {
        if (venue === 'polymarket') return mockPoly;
        if (venue === 'binance') return mockBinance;
        if (venue === 'kucoin') return mockKucoin;
        return undefined;
      };

      const coordinator = new AtomicMultiLegCoordinator(resolver);
      const order: MultiLegArbitrageOrder = {
        orderId: 'order-3leg-triangular',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-poly', venue: 'polymarket', symbol: 'TOKEN-YES', side: 'buy', type: 'limit', amount: 1000, price: 0.52 },
          { legId: 'leg-bin', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.01, price: 50000 },
          { legId: 'leg-ku', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.01, price: 50100 },
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('FILLED');
      expect(report.legs.length).toBe(3);
      expect(mockPoly.placeOrder).toHaveBeenCalledTimes(1);
      expect(mockBinance.placeOrder).toHaveBeenCalledTimes(1);
      expect(mockKucoin.placeOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Sequential Staged Execution', () => {
    it('executes sequentially in stage order when each leg fills', async () => {
      const callSequence: string[] = [];

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async () => {
          callSequence.push('binance');
          return {
            orderId: 'seq-bin',
            exchange: 'binance',
            symbol: 'ETH/USDT',
            side: 'buy',
            price: 3000,
            amount: 2,
            filled: 2,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          callSequence.push('bybit');
          return {
            orderId: 'seq-bybit',
            exchange: 'bybit',
            symbol: 'ETH/USDT',
            side: 'sell',
            price: 3015,
            amount: 2,
            filled: 2,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-seq-ok',
        executionMode: 'sequential',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', type: 'limit', amount: 2, price: 3000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', type: 'limit', amount: 2, price: 3015 },
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('FILLED');
      expect(callSequence).toEqual(['binance', 'bybit']);
    });

    it('halts staged execution immediately on early leg failure and does NOT submit subsequent legs', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async () => {
          throw new Error('Exchange rejecting order: Insufficient liquidity');
        }),
      });

      const mockPolymarket = createMockConnector('polymarket', {
        placeOrder: vi.fn(),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockPolymarket);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-seq-early-fail',
        executionMode: 'sequential',
        legs: [
          { legId: 'stage-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'stage-2', venue: 'polymarket', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      // State is FAILED because 0 legs filled (no naked exposure created)
      expect(report.state).toBe('FAILED');
      expect(report.legs.length).toBe(1);
      expect(report.legs[0].status).toBe('failed');
      expect(mockPolymarket.placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('3. Partial Fills, Timeouts & Compensatory Unwinds', () => {
    it('cancels pending leg and unwinds filled leg when second leg times out (transitions SUBMITTED -> PARTIAL_UNWINDING -> UNWOUND)', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.side === 'sell' && params.type === 'market') {
            // Unwind order
            return {
              orderId: 'unwind-binance-fill',
              clientOrderId: params.clientOrderId,
              exchange: 'binance',
              symbol: params.symbol,
              side: 'sell',
              price: 49950,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Initial leg order
          return {
            orderId: 'binance-init-fill',
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: 'buy',
            price: 50000,
            amount: 1,
            filled: 1,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        // Hangs beyond the 30ms timeout
        placeOrder: vi.fn(
          async () => new Promise<ExchangeOrderResult>((resolve) => setTimeout(resolve, 300)),
        ),
        cancelOrder: vi.fn(async () => true),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-timeout-unwind',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000, timeoutMs: 100 },
          { legId: 'leg-by', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200, timeoutMs: 30 },
        ],
      };

      const report = await coordinator.execute(order);

      // Verified 6-state transition
      expect(report.state).toBe('UNWOUND');
      expect(report.stateHistory.map((s) => s.to)).toEqual([
        'SUBMITTED',
        'PARTIAL_UNWINDING',
        'UNWOUND',
      ]);

      // Verified Leg 2 timed out
      const bybitLeg = report.legs.find((l) => l.legId === 'leg-by');
      expect(bybitLeg?.status).toBe('timed_out');

      // Verified compensatory unwind executed reverse order on Binance
      expect(report.unwindResult).toBeDefined();
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);

      // Binance was bought 1 BTC, so unwind should place a MARKET SELL for 1 BTC
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          type: 'market',
          amount: 1,
        }),
      );
    });

    it('unwinds partial fill when leg 1 receives only 40% fill and leg 2 fails completely', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            // Unwind order
            return {
              orderId: 'unwind-partial-fill',
              exchange: 'binance',
              symbol: params.symbol,
              side: params.side,
              price: 49900,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Partial fill: requested 2.5 BTC, filled 1.0 BTC (40%)
          return {
            orderId: 'binance-partial-40',
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: 1.0,
            remaining: 1.5,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => true),
      });

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async () => {
          throw new Error('Order rejected by KuCoin: Price out of bounds');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockKucoin);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-partial-unwind',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 2.5, price: 50000 },
          { legId: 'leg-2', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 2.5, price: 50150 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('UNWOUND');
      // Cancel was called on open Binance order
      expect(mockBinance.cancelOrder).toHaveBeenCalledWith('binance-partial-40', 'BTC/USDT');

      // Compensatory unwind was called for exact filled amount (1.0 BTC)
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 1.0,
          type: 'market',
        }),
      );

      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
      expect(report.unwindResult?.success).toBe(true);
    });

    it('escalates to FAILED if compensatory unwind fails and unhedged residual delta remains', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            // Unwind attempts fail completely
            throw new Error('Binance matching engine temporarily halted');
          }
          return {
            orderId: 'binance-init-success',
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: 1,
            filled: 1,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new Error('Bybit network disconnect');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 2,
        initialBackoffMs: 5,
        backoffMultiplier: 1.5,
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-unwind-catastrophic-fail',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'leg-by', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      // Transitions PENDING -> SUBMITTED -> PARTIAL_UNWINDING -> FAILED
      expect(report.state).toBe('FAILED');
      expect(report.stateHistory.map((s) => s.to)).toEqual([
        'SUBMITTED',
        'PARTIAL_UNWINDING',
        'FAILED',
      ]);
      expect(report.unwindResult?.success).toBe(false);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(1.0);
      expect(report.error).toContain('unhedged delta');
    });

    it('retries with exponential backoff and succeeds on subsequent attempt', async () => {
      let unwindAttempts = 0;
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            unwindAttempts++;
            if (unwindAttempts === 1) {
              throw new Error('Transient rate limit error');
            }
            // Succeeded on 2nd attempt
            return {
              orderId: 'unwind-success-attempt-2',
              exchange: 'binance',
              symbol: params.symbol,
              side: params.side,
              price: 49980,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          return {
            orderId: 'b-init',
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: 1,
            filled: 1,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new Error('Bybit failed');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 3,
        initialBackoffMs: 10,
        backoffMultiplier: 2,
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-retry-backoff',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(unwindAttempts).toBe(2);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
    });
  });

  describe('4. Millisecond-Precision Timeout Verification', () => {
    it('enforces millisecond timeout precisely within expected boundaries', async () => {
      const mockSlowConnector = createMockConnector('slow-venue', {
        placeOrder: vi.fn(
          async () => new Promise<ExchangeOrderResult>((resolve) => setTimeout(resolve, 500)),
        ),
      });

      const resolver = () => mockSlowConnector;
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const targetTimeoutMs = 40;
      const start = Date.now();

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-ms-precision',
        legs: [
          { legId: 'leg-slow', venue: 'slow-venue', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000, timeoutMs: targetTimeoutMs },
        ],
      };

      const report = await coordinator.execute(order);
      const elapsed = Date.now() - start;

      expect(report.state).toBe('FAILED');
      expect(report.legs[0].status).toBe('timed_out');
      // Confirms timeout triggered near target (allowing 60ms scheduler jitter on macOS, but well below 500ms promise resolve)
      expect(elapsed).toBeGreaterThanOrEqual(targetTimeoutMs - 5);
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe('5. ArbitrageRiskGuard Integration & Exposure Tracking', () => {
    it('blocks order execution before submission when risk limit is breached', async () => {
      const mockBinance = createMockConnector('binance');
      const resolver = () => mockBinance;

      // Risk guard configured with tight $5,000 max notional cap
      const riskGuard = new ArbitrageRiskGuard({
        maxPerTradeNotionalUsd: 5000,
        mode: 'paper',
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, { riskGuard });

      // Basket notional is 1 BTC * $50,000 = $50,000 (breaches $5,000 cap)
      const order: MultiLegArbitrageOrder = {
        orderId: 'order-risk-breach',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('FAILED');
      expect(report.error).toContain('EXCEEDS_NOTIONAL_CAP');
      // Verify exchange connector was NEVER called
      expect(mockBinance.placeOrder).not.toHaveBeenCalled();
    });

    it('records trade opened on submission and closed on completion in ArbitrageRiskGuard', async () => {
      const mockBinance = createMockConnector('binance');
      const resolver = () => mockBinance;

      const riskGuard = new ArbitrageRiskGuard({
        maxPerTradeNotionalUsd: 100000,
        mode: 'paper',
      });

      const openSpy = vi.spyOn(riskGuard, 'recordTradeOpened');
      const closeSpy = vi.spyOn(riskGuard, 'recordTradeClosed');

      const coordinator = new AtomicMultiLegCoordinator(resolver, { riskGuard });

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-exposure-audit',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.1, price: 50000 },
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('FILLED');

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalledTimes(1);

      // Verify that after trade closed, open exposure is returned to zero
      const exposures = riskGuard.getExposures();
      expect(exposures.venues['binance'] ?? 0).toBe(0);
      expect(exposures.symbols['BTC/USDT'] ?? 0).toBe(0);
    });
  });

  describe('6. Zod Schema Validation & Integrity Checks', () => {
    it('validates ExecutionStateSchema across all 6 formal states', () => {
      const validStates: ExecutionState[] = [
        'PENDING',
        'SUBMITTED',
        'FILLED',
        'PARTIAL_UNWINDING',
        'UNWOUND',
        'FAILED',
      ];

      for (const s of validStates) {
        expect(ExecutionStateSchema.parse(s)).toBe(s);
      }

      expect(() => ExecutionStateSchema.parse('INVALID_STATE')).toThrow();
    });

    it('validates MultiLegArbitrageOrderSchema rejects invalid amounts or empty legs', () => {
      // Empty legs rejected
      expect(() =>
        MultiLegArbitrageOrderSchema.parse({
          orderId: 'ord-bad-1',
          legs: [],
        }),
      ).toThrow();

      // Negative amount rejected
      expect(() =>
        LegOrderParamsSchema.parse({
          legId: 'leg-bad',
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: -1,
          price: 50000,
        }),
      ).toThrow();

      // Valid order parses cleanly
      const valid = MultiLegArbitrageOrderSchema.parse({
        orderId: 'ord-good-1',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
        ],
      });
      expect(valid.orderId).toBe('ord-good-1');
    });

    it('validates CompensatoryUnwindRequestSchema and UnwindResultSchema', () => {
      const validRequest = CompensatoryUnwindRequestSchema.parse({
        executionId: 'exec-123',
        reason: 'Leg timeout',
        legsToUnwind: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', filledAmount: 0.5, entryPrice: 50000 },
        ],
      });
      expect(validRequest.executionId).toBe('exec-123');

      const validResult = UnwindResultSchema.parse({
        unwindId: 'unwind-123',
        success: true,
        unwoundLegs: [],
        unhedgedResidualDelta: 0,
        totalRealizedLossUsd: 12.5,
        attempts: 1,
        timestamp: Date.now(),
      });
      expect(validResult.success).toBe(true);
    });

    it('calculates net realized PnL correctly across mixed buy and sell legs', () => {
      const legs: LegExecutionReport[] = [
        {
          legId: 'leg-buy',
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          requestedAmount: 1,
          filledAmount: 1,
          remainingAmount: 0,
          price: 50000,
          avgFillPrice: 50000,
          status: 'filled',
          fee: { amount: 5, currency: 'USDT' },
          latencyMs: 10,
        },
        {
          legId: 'leg-sell',
          venue: 'bybit',
          symbol: 'BTC/USDT',
          side: 'sell',
          requestedAmount: 1,
          filledAmount: 1,
          remainingAmount: 0,
          price: 50300,
          avgFillPrice: 50300,
          status: 'filled',
          fee: { amount: 6, currency: 'USDT' },
          latencyMs: 12,
        },
      ];

      // Buy cost = 50000 + 5 = 50005
      // Sell revenue = 50300 - 6 = 50294
      // PnL = 50294 - 50005 = 289
      const pnl = calculateMultiLegRealizedPnl(legs);
      expect(pnl).toBe(289);
    });
  });
});

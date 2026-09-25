/**
 * Milestone 3 Adversarial Empirical Test Suite:
 * Stress-testing edge cases in AtomicMultiLegCoordinator and CompensatoryUnwindHandler.
 *
 * Scenarios tested:
 * 1. Catastrophic Unwind Failure (exhausts retries + emergency fallback -> state FAILED + residual unhedged delta).
 * 2. Resilient Open Leg Cancellation (cancellation throws network error -> handles gracefully without crashing & unwinds filled legs).
 * 3. High-Load Concurrent Multi-Basket Execution (50 parallel multi-leg orders -> race conditions, memory leaks, state history integrity).
 * 4. ArbitrageRiskGuard Exposure Reconciliation under concurrent stress.
 * 5. Staged Sequential Execution with partial fill & cancellation error.
 *
 * @module tests/desk/arbitrage/m3-adversarial-unwind.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AtomicMultiLegCoordinator,
} from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import {
  CompensatoryUnwindHandler,
} from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import {
  type MultiLegArbitrageOrder,
  type LegOrderParams,
  type LegExecutionReport,
  type ExecutionState,
  MultiLegExecutionReportSchema,
  UnwindResultSchema,
} from '../../../src/desk/arbitrage/execution-types';
import {
  ArbitrageRiskGuard,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import {
  type IExchangeConnector,
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  type ExchangeBalance,
  ExchangeNetworkError,
  OrderPlacementError,
} from '../../../src/desk/arbitrage/connectors/types';

describe('Milestone 3 Adversarial Challenge: Atomic Execution & Unwind Edge Cases', () => {
  // Helper to create fully typed mock connectors
  const createMockConnector = (
    exchangeId: string,
    overrides?: Partial<IExchangeConnector>,
  ): IExchangeConnector => {
    return {
      exchangeId,
      placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
        orderId: `ord-${exchangeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientOrderId: params.clientOrderId,
        exchange: exchangeId,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 50000,
        amount: params.amount,
        filled: params.amount,
        remaining: 0,
        status: 'closed',
        fee: { amount: 1.0, currency: 'USDT' },
        timestamp: Date.now(),
      })),
      cancelOrder: vi.fn(async () => true),
      fetchOrder: vi.fn(async () => ({
        orderId: 'mock-order-id',
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
      getLatencyMs: vi.fn(async () => 10),
      ...overrides,
    };
  };

  // Helper for small delays in mock connectors
  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CATASTROPHIC UNWIND FAILURE & RESIDUAL DELTA ACCOUNTING
  // ════════════════════════════════════════════════════════════════════════════

  describe('1. Catastrophic Unwind Failure & Residual Delta Accounting', () => {
    it('escalates to FAILED and explicitly reports residual unhedged delta when connector fails all retries and emergency fallback', async () => {
      const recordedClientOrderIds: string[] = [];

      // Binance connector fills the initial buy leg, but fails ALL compensatory unwind attempts
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            // Unwind order
            if (params.clientOrderId) {
              recordedClientOrderIds.push(params.clientOrderId);
            }
            throw new OrderPlacementError('Liquidation engine unavailable: Margin call freeze', 'binance');
          }
          // Initial order succeeds with full fill of 1.75 BTC
          return {
            orderId: 'binance-init-fill-1',
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            fee: { amount: 5, currency: 'USDT' },
            timestamp: Date.now(),
          };
        }),
      });

      // Bybit connector immediately rejects the counter leg
      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new ExchangeNetworkError('Bybit socket disconnected before ACK', 'bybit');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);

      // Fast backoff for test speed: maxRetries=3, emergencyFallback=true
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 3,
        initialBackoffMs: 2,
        backoffMultiplier: 1.5,
        emergencyFallback: true,
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-catastrophic-unwind-1',
        opportunityId: 'opp-catastrophic-1',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-buy-binance', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1.75, price: 50000 },
          { legId: 'leg-sell-bybit', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1.75, price: 50300 },
        ],
      };

      const report = await coordinator.execute(order);

      // 1. Verify terminal state escalated to FAILED
      expect(report.state).toBe('FAILED');

      // 2. Verify state machine lifecycle: PENDING -> SUBMITTED -> PARTIAL_UNWINDING -> FAILED
      expect(report.stateHistory.map((s) => s.to)).toEqual([
        'SUBMITTED',
        'PARTIAL_UNWINDING',
        'FAILED',
      ]);
      expect(report.stateHistory[2].reason).toContain('Unwind incomplete; unhedged delta of 1.75 remains');

      // 3. Verify unwindResult explicitly reports unhedged residual delta
      expect(report.unwindResult).toBeDefined();
      expect(report.unwindResult?.success).toBe(false);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(1.75);
      expect(report.unwindResult?.attempts).toBe(4); // 1 initial + 3 retries (including emergency)
      expect(report.error).toContain('unhedged delta: 1.75');

      // 4. Verify emergency fallback clientOrderId prefix was used on final retry
      expect(recordedClientOrderIds.length).toBe(4);
      expect(recordedClientOrderIds[0]).toContain('unwind-');
      expect(recordedClientOrderIds[1]).toContain('unwind-');
      expect(recordedClientOrderIds[2]).toContain('unwind-');
      expect(recordedClientOrderIds[3]).toContain('emergency-unwind-');

      // 5. Verify Zod schema parses the report without errors
      expect(MultiLegExecutionReportSchema.parse(report).executionId).toBe('order-catastrophic-unwind-1');
    });

    it('handles multi-leg partial unwind where one leg unwinds and another fails, reporting exact residual unhedged delta', async () => {
      // Leg 1 (Binance buy 2.0 BTC): fills 2.0. Unwind succeeds.
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          return {
            orderId: `binance-${params.type === 'market' ? 'unwind' : 'init'}`,
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      // Leg 2 (Bybit sell 2.0 BTC): partial fill of 0.8 BTC, 1.2 remaining. Unwind fails all retries.
      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            throw new OrderPlacementError('Bybit liquidation rejected: Insufficient liquidity', 'bybit');
          }
          return {
            orderId: 'bybit-partial-init',
            clientOrderId: params.clientOrderId,
            exchange: 'bybit',
            symbol: params.symbol,
            side: params.side,
            price: 50200,
            amount: params.amount,
            filled: 0.8,
            remaining: 1.2,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => true),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);

      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 2,
        initialBackoffMs: 2,
        backoffMultiplier: 1.5,
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-multi-unwind-partial-fail',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 2.0, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 2.0, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      // State is FAILED because Bybit's 0.8 BTC could not be unwound
      expect(report.state).toBe('FAILED');
      expect(report.unwindResult?.success).toBe(false);

      // Binance leg 2.0 BTC was unwound (filledAmount: 2.0)
      const binanceUnwind = report.unwindResult?.unwoundLegs.find((l) => l.venue === 'binance');
      expect(binanceUnwind?.status).toBe('filled');
      expect(binanceUnwind?.filledAmount).toBe(2.0);

      // Residual unhedged delta should be exactly the 0.8 BTC that failed to unwind
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0.8);
      expect(report.error).toContain('0.8');
    });

    it('reports residual delta and escalates to FAILED when connector is missing for an unwind target', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
          orderId: 'binance-init-fill',
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: params.amount,
          filled: params.amount,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      // Resolver returns binance for initial placement, but phantom-venue is missing
      const resolver = (venue: string) => {
        if (venue === 'binance') return mockBinance;
        return undefined;
      };

      const unwindHandler = new CompensatoryUnwindHandler(resolver);
      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-missing-connector-unwind',
        legs: [
          { legId: 'leg-binance', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1.0, price: 50000 },
          { legId: 'leg-missing', venue: 'phantom-venue', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1.0, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('UNWOUND'); // Wait: Binance filled 1.0, phantom-venue failed initial with 'No connector found'. Binance filled 1.0 unwound on Binance!
      expect(report.unwindResult?.success).toBe(true);

      // Now let's test when the FILLED leg's connector goes missing during unwind
      let dynamicMissing = false;
      const dynamicResolver = (venue: string) => {
        if (dynamicMissing && venue === 'binance') return undefined;
        if (venue === 'binance') return mockBinance;
        return undefined;
      };

      const dynamicUnwindHandler = new CompensatoryUnwindHandler(dynamicResolver);
      const dynamicCoordinator = new AtomicMultiLegCoordinator(dynamicResolver, dynamicUnwindHandler);

      // Order with 1 leg that fills on Binance, but resolver drops connector right before unwind
      const mockBybitFail = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new Error('Bybit rejected');
        }),
      });

      const dynamicResolver2 = (venue: string) => {
        if (venue === 'bybit') return mockBybitFail;
        if (venue === 'binance') {
          if (dynamicMissing) return undefined;
          return mockBinance;
        }
        return undefined;
      };

      const dynamicCoordinator2 = new AtomicMultiLegCoordinator(
        dynamicResolver2,
        new CompensatoryUnwindHandler(dynamicResolver2),
      );

      // Trigger: Binance fills 1.0, Bybit fails. Before unwind, drop Binance connector
      mockBinance.placeOrder = vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
        dynamicMissing = true; // Drop connector for subsequent calls
        return {
          orderId: 'binance-init-fill-drop',
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: params.amount,
          filled: params.amount,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        };
      });

      const report2 = await dynamicCoordinator2.execute({
        orderId: 'order-resolver-dropped',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1.0, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1.0, price: 50200 },
        ],
      });

      expect(report2.state).toBe('FAILED');
      expect(report2.unwindResult?.success).toBe(false);
      expect(report2.unwindResult?.unhedgedResidualDelta).toBe(1.0);
      expect(report2.unwindResult?.error).toContain('No connector registered for venue "binance"');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. RESILIENT OPEN LEG CANCELLATION UNDER NETWORK / VENUE FAILURE
  // ════════════════════════════════════════════════════════════════════════════

  describe('2. Resilient Open Leg Cancellation Under Network / Venue Failure', () => {
    it('handles network error (ETIMEDOUT) during cancellation of an unfilled leg without crashing, and unwinds filled legs', async () => {
      // Leg 1 (Binance buy 1.0 BTC): fills 100%
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
          orderId: `binance-${params.type === 'market' ? 'unwind' : 'init'}`,
          clientOrderId: params.clientOrderId,
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: params.amount,
          filled: params.amount,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
        cancelOrder: vi.fn(async () => true),
      });

      // Leg 2 (KuCoin sell 1.0 BTC): partial fill 0.1 BTC, 0.9 remaining.
      // KuCoin cancelOrder throws a network timeout error!
      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            // Unwind succeeds for the 0.1 filled
            return {
              orderId: 'kucoin-unwind-fill',
              exchange: 'kucoin',
              symbol: params.symbol,
              side: params.side,
              price: 50150,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Initial partial fill
          return {
            orderId: 'kucoin-partial-order-77',
            clientOrderId: params.clientOrderId,
            exchange: 'kucoin',
            symbol: params.symbol,
            side: params.side,
            price: 50200,
            amount: params.amount,
            filled: 0.1,
            remaining: 0.9,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => {
          // Cancellation fails catastrophically with network timeout
          throw new ExchangeNetworkError('ETIMEDOUT: KuCoin REST API unreachable during cancel', 'kucoin');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockKucoin);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-cancel-fail-unwind-ok',
        legs: [
          { legId: 'leg-bin', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1.0, price: 50000 },
          { legId: 'leg-ku', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1.0, price: 50200 },
        ],
      };

      // Ensure execution does not throw uncaught error
      const report = await coordinator.execute(order);

      // Verify cancel was attempted on KuCoin order
      expect(mockKucoin.cancelOrder).toHaveBeenCalledWith('kucoin-partial-order-77', 'BTC/USDT');

      // Verify coordinator continued and unwound both filled positions:
      // Binance 1.0 BTC buy -> unwind market sell 1.0 BTC
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 1.0,
          type: 'market',
        }),
      );

      // KuCoin 0.1 BTC sell -> unwind market buy 0.1 BTC
      expect(mockKucoin.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          type: 'market',
        }),
      );

      // Overall state transitions gracefully to UNWOUND with zero residual delta
      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
    });

    it('handles multiple concurrent cancellation failures across diverse failure modes (rejection and synchronous throws)', async () => {
      // 4-leg order:
      // Leg 1: Binance buy 1.0 BTC -> FILLED 1.0
      // Leg 2: Bybit sell 0.3 BTC -> PARTIAL 0.1 filled, 0.2 open (cancel rejects with 502)
      // Leg 3: KuCoin sell 0.3 BTC -> PARTIAL 0.1 filled, 0.2 open (cancel throws synchronous exception)
      // Leg 4: Polymarket sell 0.4 BTC -> REJECTED immediately

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
          orderId: `binance-${params.type === 'market' ? 'unwind' : 'init'}`,
          exchange: 'binance',
          symbol: params.symbol,
          side: params.side,
          price: 50000,
          amount: params.amount,
          filled: params.amount,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            return {
              orderId: 'bybit-unwind',
              exchange: 'bybit',
              symbol: params.symbol,
              side: params.side,
              price: 50100,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          return {
            orderId: 'bybit-ord-99',
            exchange: 'bybit',
            symbol: params.symbol,
            side: params.side,
            price: 50100,
            amount: params.amount,
            filled: 0.1,
            remaining: 0.2,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => {
          throw new Error('Bybit 502 Bad Gateway during cancellation');
        }),
      });

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            return {
              orderId: 'kucoin-unwind',
              exchange: 'kucoin',
              symbol: params.symbol,
              side: params.side,
              price: 50150,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          return {
            orderId: 'kucoin-ord-88',
            exchange: 'kucoin',
            symbol: params.symbol,
            side: params.side,
            price: 50150,
            amount: params.amount,
            filled: 0.1,
            remaining: 0.2,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(() => {
          // Synchronous throw inside the promise executor
          return Promise.reject(new TypeError('Synchronous TLS socket memory failure'));
        }),
      });

      const mockPolymarket = createMockConnector('polymarket', {
        placeOrder: vi.fn(async () => {
          throw new Error('Polymarket order rejected: Insufficient liquidity');
        }),
      });

      const resolver = (venue: string) => {
        if (venue === 'binance') return mockBinance;
        if (venue === 'bybit') return mockBybit;
        if (venue === 'kucoin') return mockKucoin;
        if (venue === 'polymarket') return mockPolymarket;
        return undefined;
      };

      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-multi-cancel-fails',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1.0, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.3, price: 50100 },
          { legId: 'leg-3', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.3, price: 50150 },
          { legId: 'leg-4', venue: 'polymarket', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.4, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      // Verify coordinator did not crash and unwound all 3 filled legs (1.0 + 0.1 + 0.1)
      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
      expect(report.unwindResult?.unwoundLegs.length).toBe(3);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. CONCURRENT MULTI-BASKET EXECUTION UNDER HIGH LOAD (50 PARALLEL ORDERS)
  // ════════════════════════════════════════════════════════════════════════════

  describe('3. Concurrent Multi-Basket Execution Under High Load (50 Parallel Orders)', () => {
    it('executes 50 parallel multi-leg orders under concurrent load with mock connectors and random latency jitter', async () => {
      // Create shared mock connectors with randomized network delay (1ms - 8ms)
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          await delay(Math.floor(Math.random() * 6) + 1);
          if (params.type === 'market' && params.clientOrderId?.includes('catastrophic')) {
            throw new OrderPlacementError('Binance market liquidation freeze', 'binance');
          }
          return {
            orderId: `binance-load-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          await delay(Math.floor(Math.random() * 6) + 1);
          // If this is initial leg order with timeout tag, hang to trigger timeout
          if (params.type !== 'market' && params.clientOrderId?.includes('timeout')) {
            await delay(80); // Longer than leg timeout (25ms)
          }
          // If this is initial leg order with partial tag, return 50% partial fill
          if (params.type !== 'market' && params.clientOrderId?.includes('partial')) {
            return {
              orderId: `bybit-load-part-${Date.now()}`,
              clientOrderId: params.clientOrderId,
              exchange: 'bybit',
              symbol: params.symbol,
              side: params.side,
              price: 50200,
              amount: params.amount,
              filled: params.amount * 0.5,
              remaining: params.amount * 0.5,
              status: 'open',
              timestamp: Date.now(),
            };
          }
          // If initial leg order with fail-leg tag, throw error
          if (params.type !== 'market' && params.clientOrderId?.includes('fail-leg')) {
            throw new Error('Bybit counter-leg liquidity vanished');
          }
          return {
            orderId: `bybit-load-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientOrderId: params.clientOrderId,
            exchange: 'bybit',
            symbol: params.symbol,
            side: params.side,
            price: 50200,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => {
          await delay(2);
          return true;
        }),
      });

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async () => {
          throw new Error('KuCoin counter-leg reject');
        }),
        cancelOrder: vi.fn(async () => {
          throw new ExchangeNetworkError('KuCoin cancel network timeout', 'kucoin');
        }),
      });

      const resolver = (venue: string) => {
        if (venue === 'binance') return mockBinance;
        if (venue === 'bybit') return mockBybit;
        if (venue === 'kucoin') return mockKucoin;
        return undefined;
      };

      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 2,
        initialBackoffMs: 2,
        backoffMultiplier: 1.5,
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      // Generate 50 concurrent orders with mixed execution profiles:
      // - Orders 0..19: Clean concurrent fills (20 orders) -> expect FILLED
      // - Orders 20..29: Leg 2 timeout (10 orders) -> expect UNWOUND
      // - Orders 30..39: Leg 2 partial fill (10 orders) -> expect UNWOUND
      // - Orders 40..44: Leg 1 fill, Leg 2 rejects, cancellation error on KuCoin -> expect UNWOUND
      // - Orders 45..49: Leg 1 fill, Leg 2 rejects, unwind fails catastrophically -> expect FAILED
      const orders: MultiLegArbitrageOrder[] = [];

      for (let i = 0; i < 50; i++) {
        if (i < 20) {
          // Clean fill
          orders.push({
            orderId: `load-clean-${i}`,
            opportunityId: `opp-clean-${i}`,
            executionMode: 'concurrent',
            legs: [
              { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 50000 },
              { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.05, price: 50200 },
            ],
          });
        } else if (i < 30) {
          // Timeout on leg 2
          orders.push({
            orderId: `load-timeout-${i}`,
            opportunityId: `opp-timeout-${i}`,
            executionMode: 'concurrent',
            legs: [
              { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 50000, timeoutMs: 150 },
              { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.05, price: 50200, timeoutMs: 25, clientOrderId: `timeout-${i}` },
            ],
          });
        } else if (i < 40) {
          // Partial fill on leg 2
          orders.push({
            orderId: `load-partial-${i}`,
            opportunityId: `opp-partial-${i}`,
            executionMode: 'concurrent',
            legs: [
              { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 50000 },
              { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.05, price: 50200, clientOrderId: `partial-${i}` },
            ],
          });
        } else if (i < 45) {
          // Cancel error on leg 2 (KuCoin), but unwind of leg 1 succeeds
          orders.push({
            orderId: `load-cancel-err-${i}`,
            opportunityId: `opp-cancel-err-${i}`,
            executionMode: 'concurrent',
            legs: [
              { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 50000 },
              { legId: `leg-ku-${i}`, venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.05, price: 50200, clientOrderId: `cancel-err-${i}` },
            ],
          });
        } else {
          // Catastrophic unwind failure: Leg 1 fills on Binance, Leg 2 fails on Bybit,
          // then unwind on Binance fails all attempts due to 'catastrophic' clientOrderId
          orders.push({
            orderId: `load-catastrophic-${i}`,
            opportunityId: `opp-catastrophic-${i}`,
            executionMode: 'concurrent',
            legs: [
              { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 50000 },
              { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.05, price: 50200, clientOrderId: `fail-leg-${i}` },
            ],
          });
        }
      }

      // Execute all 50 orders simultaneously under heavy concurrency
      const startTime = Date.now();
      const reports = await Promise.all(orders.map((o) => coordinator.execute(o)));
      const durationMs = Date.now() - startTime;

      // 1. Verify all 50 executed
      expect(reports.length).toBe(50);

      // 2. Verify state history integrity and lack of cross-talk across every execution
      for (let i = 0; i < 50; i++) {
        const report = reports[i];
        const originalOrder = orders[i];

        // Must match submitted ID
        expect(report.executionId).toBe(originalOrder.orderId);

        // Schema validation must pass
        expect(() => MultiLegExecutionReportSchema.parse(report)).not.toThrow();

        // History must be isolated and start at PENDING
        expect(report.stateHistory.length).toBeGreaterThanOrEqual(1);
        expect(report.stateHistory[0].from).toBe('PENDING');

        // Terminal state in history must match report.state
        const lastTransition = report.stateHistory[report.stateHistory.length - 1];
        expect(lastTransition.to).toBe(report.state);

        if (i < 20) {
          // Clean fill
          expect(report.state).toBe('FILLED');
          expect(report.legs.every((l) => l.status === 'filled')).toBe(true);
        } else if (i < 45) {
          // Timeout or partial fill -> unwind
          expect(report.state).toBe('UNWOUND');
          expect(report.unwindResult?.success).toBe(true);
          expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
        } else {
          // Catastrophic unwind failure
          expect(report.state).toBe('FAILED');
          expect(report.unwindResult?.success).toBe(false);
          expect(report.unwindResult?.unhedgedResidualDelta).toBe(0.05);
        }
      }

      // 3. Performance check under load (50 concurrent orders should complete in < 5 seconds)
      expect(durationMs).toBeLessThan(5000);
    });

    it('maintains strict risk exposure accounting in ArbitrageRiskGuard across 50 concurrent baskets', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          await delay(2);
          return {
            orderId: `b-exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          await delay(2);
          if (params.clientOrderId?.includes('fail')) {
            throw new Error('Exchange reject');
          }
          return {
            orderId: `by-exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientOrderId: params.clientOrderId,
            exchange: 'bybit',
            symbol: params.symbol,
            side: params.side,
            price: 50200,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);

      // Shared RiskGuard with high notional cap and high capital so all 50 pass pre-trade check
      const riskGuard = new ArbitrageRiskGuard({
        capitalUsdc: 10_000_000,
        maxPerTradeNotionalUsd: 1_000_000,
        maxOpenPositionPerVenueUsd: 5_000_000,
        maxOpenPositionPerSymbolUsd: 5_000_000,
        mode: 'paper',
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, { riskGuard });

      // Create 50 orders (half clean fill, half failing requiring unwind)
      const orders: MultiLegArbitrageOrder[] = Array.from({ length: 50 }, (_, i) => ({
        orderId: `order-risk-stress-${i}`,
        legs: [
          { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.01, price: 50000 },
          { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.01, price: 50200, clientOrderId: i % 2 === 0 ? undefined : `fail-${i}` },
        ],
      }));

      // Execute all 50 in parallel
      const reports = await Promise.all(orders.map((o) => coordinator.execute(o)));
      expect(reports.length).toBe(50);

      // Verify that after ALL 50 trades complete (regardless of FILLED vs UNWOUND vs FAILED),
      // open exposure in ArbitrageRiskGuard has returned to exactly 0!
      const finalExposures = riskGuard.getExposures();
      expect(finalExposures.venues['binance'] ?? 0).toBe(0);
      expect(finalExposures.venues['bybit'] ?? 0).toBe(0);
      expect(finalExposures.symbols['BTC/USDT'] ?? 0).toBe(0);

      const totalVenueExposure = Object.values(finalExposures.venues).reduce((sum, v) => sum + v, 0);
      const totalSymbolExposure = Object.values(finalExposures.symbols).reduce((sum, v) => sum + v, 0);
      expect(totalVenueExposure).toBe(0);
      expect(totalSymbolExposure).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. ADDITIONAL ADVERSARIAL BOUNDARY & STRESS CASES
  // ════════════════════════════════════════════════════════════════════════════

  describe('4. Additional Adversarial Boundary & Stress Cases', () => {
    it('handles zero-fill failure when all legs fail immediately without triggering unnecessary unwinds', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async () => {
          throw new Error('Binance error: Margin call');
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new Error('Bybit error: Insufficient balance');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const unwindSpy = vi.fn();
      const unwindHandler = { executeUnwind: unwindSpy } as unknown as CompensatoryUnwindHandler;

      const coordinator = new AtomicMultiLegCoordinator(resolver, unwindHandler);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-zero-fill-fail',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('FAILED');
      expect(report.error).toContain('All legs failed to fill; no exposure created');
      expect(report.unwindResult).toBeUndefined();
      // Crucial: CompensatoryUnwindHandler must NOT be called when zero fills occurred!
      expect(unwindSpy).not.toHaveBeenCalled();
    });

    it('handles staged sequential execution where Leg 1 partially fills, canceling remaining Leg 1 and unwinding without executing subsequent legs', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            // Unwind order
            return {
              orderId: 'binance-unwind-staged',
              exchange: 'binance',
              symbol: params.symbol,
              side: params.side,
              price: 49950,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Leg 1 partial fill: requested 5 ETH, filled 2 ETH
          return {
            orderId: 'binance-partial-stage-1',
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 3000,
            amount: params.amount,
            filled: 2,
            remaining: 3,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async () => true),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'order-staged-partial-unwind',
        executionMode: 'sequential',
        legs: [
          { legId: 'stage-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', type: 'limit', amount: 5, price: 3000 },
          { legId: 'stage-2', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', type: 'limit', amount: 5, price: 3025 },
        ],
      };

      const report = await coordinator.execute(order);

      // Verify Stage 2 was NEVER dispatched
      expect(mockBybit.placeOrder).not.toHaveBeenCalled();

      // Verify open portion (3 ETH) of Stage 1 was canceled
      expect(mockBinance.cancelOrder).toHaveBeenCalledWith('binance-partial-stage-1', 'ETH/USDT');

      // Verify filled portion (2 ETH) of Stage 1 was unwound
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ETH/USDT',
          side: 'sell',
          amount: 2,
          type: 'market',
        }),
      );

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
    });
  });
});

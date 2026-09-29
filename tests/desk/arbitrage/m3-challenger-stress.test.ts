/**
 * Milestone 3 Challenger Stress Test Suite
 *
 * Empirical adversarial stress testing of:
 * - AtomicMultiLegCoordinator
 * - CompensatoryUnwindHandler
 *
 * Tests:
 * 1. Partial Fills: Leg 1 fills 40%, Leg 2 fails completely -> verify Leg 1's 40% is
 *    completely unwound with reverse order, residual delta is 0, state reaches UNWOUND.
 * 2. Multi-Leg Timeouts: Leg 1 fills 100%, Leg 2 hangs beyond timeout -> verify Leg 2
 *    is aborted and cancelled, Leg 1 is unwound, state reaches UNWOUND.
 * 3. Zero-Delta Verification: ensure no unhedged directional exposure remains after unwind
 *    across 2-leg and 3-leg multi-venue combinations.
 * 4. Exponential Backoff Retry: verify unwind connector recovers on retry attempts 2, 3,
 *    and emergency fallback attempt 4.
 * 5. Concurrent stress execution under high load with randomized failures.
 * 6. RiskGuard exposure invariants across fill and unwind lifecycles.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AtomicMultiLegCoordinator,
} from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import {
  CompensatoryUnwindHandler,
  type UnwindEventPayload,
} from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import {
  type MultiLegArbitrageOrder,
  type LegOrderParams,
  type ExecutionState,
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

describe('Milestone 3 Challenger Stress Suite: AtomicMultiLegCoordinator & CompensatoryUnwindHandler', () => {
  const createMockConnector = (
    exchangeId: string,
    overrides?: Partial<IExchangeConnector>,
  ): IExchangeConnector => ({
    exchangeId,
    placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
      orderId: `ord-${exchangeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      orderId: 'mock-order',
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
      USDT: { free: 500000, used: 0, total: 500000 },
      BTC: { free: 50, used: 0, total: 50 },
    })),
    getLatencyMs: vi.fn(async () => 10),
    ...overrides,
  });

  // ── 1. Partial Fill & Unwind Verification ────────────────────────────────────

  describe('1. Partial Fill Compensatory Unwind (Leg 1 40% Fill, Leg 2 0% Fail)', () => {
    it('unwinds 40% partial fill on Leg 1 with reverse market order, leaves zero residual delta, and reaches UNWOUND', async () => {
      const recordedCancelOrders: Array<{ orderId: string; symbol: string }> = [];
      const recordedUnwindOrders: ExchangeOrderParams[] = [];

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            recordedUnwindOrders.push(params);
            return {
              orderId: 'unwind-fill-100',
              clientOrderId: params.clientOrderId,
              exchange: 'binance',
              symbol: params.symbol,
              side: params.side,
              price: 49980,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              fee: { amount: 2.0, currency: 'USDT' },
              timestamp: Date.now(),
            };
          }
          // Initial limit buy order: requested 2.5 BTC, fills only 1.0 BTC (40%)
          return {
            orderId: 'binance-init-partial-40',
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: 1.0,
            remaining: 1.5,
            status: 'open',
            fee: { amount: 1.0, currency: 'USDT' },
            timestamp: Date.now(),
          };
        }),
        cancelOrder: vi.fn(async (orderId: string, symbol: string) => {
          recordedCancelOrders.push({ orderId, symbol });
          return true;
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async () => {
          throw new Error('Bybit: Insufficient depth for taker order');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-partial-40-test',
        opportunityId: 'opp-challenger-01',
        executionMode: 'concurrent',
        legs: [
          {
            legId: 'leg-buy-binance',
            venue: 'binance',
            symbol: 'BTC/USDT',
            side: 'buy',
            type: 'limit',
            amount: 2.5,
            price: 50000,
          },
          {
            legId: 'leg-sell-bybit',
            venue: 'bybit',
            symbol: 'BTC/USDT',
            side: 'sell',
            type: 'limit',
            amount: 2.5,
            price: 50250,
          },
        ],
      };

      const report = await coordinator.execute(order);

      // Verify final terminal state is UNWOUND
      expect(report.state).toBe('UNWOUND');

      // Verify state transition path: PENDING -> SUBMITTED -> PARTIAL_UNWINDING -> UNWOUND
      expect(report.stateHistory.map((s) => s.to)).toEqual([
        'SUBMITTED',
        'PARTIAL_UNWINDING',
        'UNWOUND',
      ]);

      // Verify cancellation was dispatched for the open 60% remainder on Binance
      expect(recordedCancelOrders).toHaveLength(1);
      expect(recordedCancelOrders[0]).toEqual({
        orderId: 'binance-init-partial-40',
        symbol: 'BTC/USDT',
      });

      // Verify unwind placed exact reverse order: bought 1.0 BTC -> must sell 1.0 BTC market order
      expect(recordedUnwindOrders).toHaveLength(1);
      expect(recordedUnwindOrders[0].symbol).toBe('BTC/USDT');
      expect(recordedUnwindOrders[0].side).toBe('sell');
      expect(recordedUnwindOrders[0].type).toBe('market');
      expect(recordedUnwindOrders[0].amount).toBe(1.0);

      // Verify residual delta is exactly 0
      expect(report.unwindResult).toBeDefined();
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
      expect(report.unwindResult?.unwoundLegs).toHaveLength(1);
      expect(report.unwindResult?.unwoundLegs[0].filledAmount).toBe(1.0);
    });

    it('unwinds 40% partial fill on a SELL leg by placing reverse BUY market order', async () => {
      const recordedUnwindOrders: ExchangeOrderParams[] = [];

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            recordedUnwindOrders.push(params);
            return {
              orderId: 'unwind-buy-fill',
              exchange: 'kucoin',
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
          // Sold 2.0 ETH of 5.0 ETH requested (40%)
          return {
            orderId: 'kucoin-sell-40',
            exchange: 'kucoin',
            symbol: params.symbol,
            side: params.side,
            price: 3000,
            amount: params.amount,
            filled: 2.0,
            remaining: 3.0,
            status: 'open',
            timestamp: Date.now(),
          };
        }),
      });

      const mockPolymarket = createMockConnector('polymarket', {
        placeOrder: vi.fn(async () => {
          throw new Error('Polymarket: Rejected by CLOB risk validator');
        }),
      });

      const resolver = (venue: string) => (venue === 'kucoin' ? mockKucoin : mockPolymarket);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-sell-unwind-test',
        executionMode: 'concurrent',
        legs: [
          {
            legId: 'leg-sell-kucoin',
            venue: 'kucoin',
            symbol: 'ETH/USDT',
            side: 'sell',
            type: 'limit',
            amount: 5.0,
            price: 3000,
          },
          {
            legId: 'leg-buy-poly',
            venue: 'polymarket',
            symbol: 'ETH/USDT',
            side: 'buy',
            type: 'limit',
            amount: 5.0,
            price: 2980,
          },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('UNWOUND');
      expect(recordedUnwindOrders).toHaveLength(1);
      // Sold 2.0 ETH -> compensatory unwind must BUY 2.0 ETH
      expect(recordedUnwindOrders[0].side).toBe('buy');
      expect(recordedUnwindOrders[0].amount).toBe(2.0);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
    });
  });

  // ── 2. Multi-Leg Timeout & Cancellation Verification ────────────────────────

  describe('2. Multi-Leg Timeouts (Leg 1 100% Fill, Leg 2 Hangs Beyond Timeout)', () => {
    it('aborts and cancels timed out leg, unwinds Leg 1, and reaches UNWOUND with zero delta', async () => {
      let leg1UnwindPlaced = false;

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          if (params.type === 'market') {
            leg1UnwindPlaced = true;
            return {
              orderId: 'binance-unwind-fill',
              exchange: 'binance',
              symbol: params.symbol,
              side: params.side,
              price: 49970,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Leg 1 fills 100% immediately
          return {
            orderId: 'binance-leg1-100',
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
        // Simulates hanging venue that delays 400ms when timeout limit is 35ms
        placeOrder: vi.fn(
          async () => new Promise<ExchangeOrderResult>((resolve) => setTimeout(resolve, 400)),
        ),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-timeout-test',
        executionMode: 'concurrent',
        legs: [
          {
            legId: 'leg-b1',
            venue: 'binance',
            symbol: 'BTC/USDT',
            side: 'buy',
            type: 'limit',
            amount: 1.0,
            price: 50000,
            timeoutMs: 150,
          },
          {
            legId: 'leg-by2',
            venue: 'bybit',
            symbol: 'BTC/USDT',
            side: 'sell',
            type: 'limit',
            amount: 1.0,
            price: 50200,
            timeoutMs: 35,
          },
        ],
      };

      const start = Date.now();
      const report = await coordinator.execute(order);
      const durationMs = Date.now() - start;

      expect(report.state).toBe('UNWOUND');
      expect(durationMs).toBeLessThan(300); // Proves it didn't wait for 400ms promise

      const bybitLeg = report.legs.find((l) => l.legId === 'leg-by2');
      expect(bybitLeg).toBeDefined();
      expect(bybitLeg?.status).toBe('timed_out');
      expect(bybitLeg?.error).toContain('LEG_TIMEOUT');

      expect(leg1UnwindPlaced).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
      expect(report.unwindResult?.success).toBe(true);
    });

    it('handles multiple legs timing out simultaneously with zero inventory created', async () => {
      const mockVenueA = createMockConnector('venueA', {
        placeOrder: vi.fn(
          async () => new Promise<ExchangeOrderResult>((resolve) => setTimeout(resolve, 300)),
        ),
      });
      const mockVenueB = createMockConnector('venueB', {
        placeOrder: vi.fn(
          async () => new Promise<ExchangeOrderResult>((resolve) => setTimeout(resolve, 300)),
        ),
      });

      const resolver = (venue: string) => (venue === 'venueA' ? mockVenueA : mockVenueB);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-dual-timeout',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-a', venue: 'venueA', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000, timeoutMs: 25 },
          { legId: 'leg-b', venue: 'venueB', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 1, price: 50200, timeoutMs: 25 },
        ],
      };

      const report = await coordinator.execute(order);

      // Since zero legs filled, no unwind was required and state transitions to FAILED
      expect(report.state).toBe('FAILED');
      expect(report.stateHistory.map((s) => s.to)).toEqual(['SUBMITTED', 'FAILED']);
      expect(report.legs.every((l) => l.status === 'timed_out')).toBe(true);
      expect(report.unwindResult).toBeUndefined();
    });
  });

  // ── 3. Exponential Backoff Retry on Unwind ──────────────────────────────────

  describe('3. Compensatory Unwind Exponential Backoff Retry', () => {
    it('retries with exponential backoff and succeeds on Attempt 2 when connector initially fails', async () => {
      let placeAttempts = 0;
      const retryDelays: number[] = [];
      let lastCallTime = Date.now();

      const mockConnector = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          placeAttempts++;
          const now = Date.now();
          if (placeAttempts > 1) {
            retryDelays.push(now - lastCallTime);
          }
          lastCallTime = now;

          if (placeAttempts === 1) {
            throw new Error('HTTP 429 Too Many Requests: Rate limit exceeded');
          }

          return {
            orderId: 'unwind-success-attempt-2',
            clientOrderId: params.clientOrderId,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 49950,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: now,
          };
        }),
      });

      const resolver = () => mockConnector;
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 3,
        initialBackoffMs: 20,
        backoffMultiplier: 2,
      });

      const retryEvents: UnwindEventPayload[] = [];
      unwindHandler.on('unwind:retry', (e: UnwindEventPayload) => retryEvents.push(e));

      const result = await unwindHandler.executeUnwind({
        executionId: 'exec-retry-2',
        reason: 'Test retry attempt 2',
        legsToUnwind: [
          {
            legId: 'leg-retry-1',
            venue: 'binance',
            symbol: 'BTC/USDT',
            side: 'buy',
            filledAmount: 1.5,
            entryPrice: 50000,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.unhedgedResidualDelta).toBe(0);
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].attempt).toBe(2);
      expect(retryDelays[0]).toBeGreaterThanOrEqual(18); // ~20ms initial backoff
    });

    it('retries with exponential backoff and succeeds on Attempt 3 after 2 consecutive failures', async () => {
      let placeAttempts = 0;

      const mockConnector = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          placeAttempts++;
          if (placeAttempts === 1) {
            throw new Error('Attempt 1: Connection reset by peer');
          }
          if (placeAttempts === 2) {
            throw new Error('Attempt 2: 503 Service Unavailable');
          }
          return {
            orderId: 'unwind-success-attempt-3',
            clientOrderId: params.clientOrderId,
            exchange: 'bybit',
            symbol: params.symbol,
            side: params.side,
            price: 50150,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const resolver = () => mockConnector;
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 3,
        initialBackoffMs: 10,
        backoffMultiplier: 2,
      });

      const result = await unwindHandler.executeUnwind({
        executionId: 'exec-retry-3',
        reason: 'Test retry attempt 3',
        legsToUnwind: [
          {
            legId: 'leg-retry-3',
            venue: 'bybit',
            symbol: 'BTC/USDT',
            side: 'sell',
            filledAmount: 0.8,
            entryPrice: 50200,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(placeAttempts).toBe(3);
      expect(result.unhedgedResidualDelta).toBe(0);
    });

    it('triggers emergency liquidation fallback on attempt 4 when attempts 1-3 fail', async () => {
      let placeAttempts = 0;
      const clientOrderIdsReceived: string[] = [];

      const mockConnector = createMockConnector('kucoin', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          placeAttempts++;
          if (params.clientOrderId) {
            clientOrderIdsReceived.push(params.clientOrderId);
          }

          if (placeAttempts < 4) {
            throw new Error(`Attempt ${placeAttempts} rejected`);
          }

          return {
            orderId: 'unwind-emergency-4',
            clientOrderId: params.clientOrderId,
            exchange: 'kucoin',
            symbol: params.symbol,
            side: params.side,
            price: 49800,
            amount: params.amount,
            filled: params.amount,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const resolver = () => mockConnector;
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 3,
        initialBackoffMs: 5,
        backoffMultiplier: 1.5,
        emergencyFallback: true,
      });

      const result = await unwindHandler.executeUnwind({
        executionId: 'exec-emergency-fallback',
        reason: 'Emergency fallback test',
        legsToUnwind: [
          {
            legId: 'leg-ku-fail',
            venue: 'kucoin',
            symbol: 'BTC/USDT',
            side: 'buy',
            filledAmount: 1.0,
            entryPrice: 50000,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(placeAttempts).toBe(4);
      expect(result.unhedgedResidualDelta).toBe(0);

      // Verify that the final attempt used the emergency order prefix
      const lastClientOrderId = clientOrderIdsReceived[clientOrderIdsReceived.length - 1];
      expect(lastClientOrderId).toContain('emergency-unwind');
    });

    it('escalates to FAILED with remaining unhedged residual delta when all retry attempts fail', async () => {
      const mockConnector = createMockConnector('failing-venue', {
        placeOrder: vi.fn(async () => {
          throw new Error('Fatal: Venue engine halted permanently');
        }),
      });

      const resolver = () => mockConnector;
      const unwindHandler = new CompensatoryUnwindHandler(resolver, {
        maxRetries: 2,
        initialBackoffMs: 5,
        backoffMultiplier: 1.5,
      });

      const escalatedEvents: UnwindEventPayload[] = [];
      unwindHandler.on('unwind:escalated', (e: UnwindEventPayload) => escalatedEvents.push(e));

      const result = await unwindHandler.executeUnwind({
        executionId: 'exec-exhausted-retries',
        reason: 'Unwind exhaustion test',
        legsToUnwind: [
          {
            legId: 'leg-dead',
            venue: 'failing-venue',
            symbol: 'ETH/USDT',
            side: 'buy',
            filledAmount: 3.5,
            entryPrice: 3000,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.unhedgedResidualDelta).toBe(3.5);
      expect(result.error).toContain('Fatal: Venue engine halted permanently');
      expect(escalatedEvents).toHaveLength(1);
      expect(escalatedEvents[0].amount).toBe(3.5);
    });
  });

  // ── 4. Zero-Delta Invariance & Multi-Venue Stress ───────────────────────────

  describe('4. Zero-Delta Invariance Across Multi-Venue Combinations (3-Leg Triangular)', () => {
    it('guarantees 0 unhedged residual delta across Polymarket, Binance, and KuCoin when Leg 3 fails', async () => {
      const unwoundVenues: string[] = [];

      const mockPoly = createMockConnector('polymarket', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            unwoundVenues.push('polymarket');
            return {
              orderId: 'unwind-poly',
              exchange: 'polymarket',
              symbol: params.symbol,
              side: params.side,
              price: 0.51,
              amount: params.amount,
              filled: params.amount,
              remaining: 0,
              status: 'closed',
              timestamp: Date.now(),
            };
          }
          // Leg 1: Fills 100% (1000 tokens)
          return {
            orderId: 'poly-filled',
            exchange: 'polymarket',
            symbol: params.symbol,
            side: params.side,
            price: 0.52,
            amount: 1000,
            filled: 1000,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            unwoundVenues.push('binance');
            return {
              orderId: 'unwind-binance',
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
          // Leg 2: Fills 100% (0.01 BTC)
          return {
            orderId: 'binance-filled',
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: 0.01,
            filled: 0.01,
            remaining: 0,
            status: 'closed',
            timestamp: Date.now(),
          };
        }),
      });

      const mockKucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn(async () => {
          // Leg 3: Fails completely
          throw new Error('KuCoin: Matching order not found');
        }),
      });

      const resolver = (venue: string) => {
        if (venue === 'polymarket') return mockPoly;
        if (venue === 'binance') return mockBinance;
        if (venue === 'kucoin') return mockKucoin;
        return undefined;
      };

      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-triangular-unwind',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-poly', venue: 'polymarket', symbol: 'TOKEN-YES', side: 'buy', type: 'limit', amount: 1000, price: 0.52 },
          { legId: 'leg-bin', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.01, price: 50000 },
          { legId: 'leg-ku', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.01, price: 50100 },
        ],
      };

      const report = await coordinator.execute(order);

      expect(report.state).toBe('UNWOUND');
      expect(unwoundVenues).toContain('polymarket');
      expect(unwoundVenues).toContain('binance');
      expect(unwoundVenues).not.toContain('kucoin'); // Kucoin had 0 fills

      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0);
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unwoundLegs).toHaveLength(2);
    });

    it('leaves residual delta and marks FAILED when a venue connector is missing during unwind', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            return {
              orderId: 'unwind-b',
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
          }
          return {
            orderId: 'b-fill',
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

      const mockGhostVenue = createMockConnector('ghost-venue', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => ({
          orderId: 'ghost-fill',
          exchange: 'ghost-venue',
          symbol: params.symbol,
          side: params.side,
          price: 50100,
          amount: 1,
          filled: 1,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        })),
      });

      const mockThirdVenue = createMockConnector('third-venue', {
        placeOrder: vi.fn(async () => {
          throw new Error('Third venue failed');
        }),
      });

      let ghostActive = true;
      const resolver = (venue: string) => {
        if (venue === 'binance') return mockBinance;
        if (venue === 'ghost-venue' && ghostActive) return mockGhostVenue;
        if (venue === 'third-venue') return mockThirdVenue;
        return undefined; // ghost-venue unbinds during unwind!
      };

      const coordinator = new AtomicMultiLegCoordinator(resolver);

      // We simulate connector being deregistered/lost right before unwind triggers
      const origExecute = mockThirdVenue.placeOrder;
      mockThirdVenue.placeOrder = vi.fn(async (params) => {
        ghostActive = false; // Connector vanishes
        return origExecute(params);
      });

      const order: MultiLegArbitrageOrder = {
        orderId: 'challenger-missing-connector-test',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50000 },
          { legId: 'leg-2', venue: 'ghost-venue', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 1, price: 50100 },
          { legId: 'leg-3', venue: 'third-venue', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 2, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);

      // Leg 1 was unwound, but Leg 2 could not be unwound because ghost-venue connector disappeared!
      expect(report.state).toBe('FAILED');
      expect(report.unwindResult?.success).toBe(false);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(1);
      expect(report.error).toContain('unhedged delta');
    });
  });

  // ── 5. High-Concurrency Stress Test ─────────────────────────────────────────

  describe('5. High-Concurrency Stress & Race Conditions', () => {
    it('executes 15 concurrent multi-leg orders with random outcomes with 0 state corruptions or delta leaks', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          // Add random latency 5-25ms
          await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));

          if (params.type === 'market') {
            // Unwind always succeeds
            return {
              orderId: `unwind-binance-${Date.now()}-${Math.random()}`,
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
          }

          // Initial orders: 70% fill 100%, 30% fill 40%
          const fillRatio = Math.random() > 0.3 ? 1.0 : 0.4;
          return {
            orderId: `binance-init-${Date.now()}-${Math.random()}`,
            exchange: 'binance',
            symbol: params.symbol,
            side: params.side,
            price: 50000,
            amount: params.amount,
            filled: params.amount * fillRatio,
            remaining: params.amount * (1 - fillRatio),
            status: fillRatio === 1.0 ? 'closed' : 'open',
            timestamp: Date.now(),
          };
        }),
      });

      const mockBybit = createMockConnector('bybit', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => {
          await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));

          if (params.type === 'market') {
            return {
              orderId: `unwind-bybit-${Date.now()}-${Math.random()}`,
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
          }

          // 50% chance of throwing error or timing out
          if (Math.random() > 0.5) {
            throw new Error('Simulated random Bybit drop');
          }

          return {
            orderId: `bybit-init-${Date.now()}-${Math.random()}`,
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
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const promises = Array.from({ length: 15 }, (_, i) => {
        const order: MultiLegArbitrageOrder = {
          orderId: `stress-order-${i}`,
          opportunityId: `opp-${i}`,
          legs: [
            { legId: `leg-b-${i}`, venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.5, price: 50000 },
            { legId: `leg-by-${i}`, venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.5, price: 50200 },
          ],
        };
        return coordinator.execute(order);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(15);
      for (const res of results) {
        expect(['FILLED', 'UNWOUND', 'FAILED']).toContain(res.state);

        if (res.state === 'FILLED') {
          expect(res.unwindResult).toBeUndefined();
          expect(res.legs.every((l) => l.status === 'filled')).toBe(true);
        } else if (res.state === 'UNWOUND') {
          expect(res.unwindResult).toBeDefined();
          expect(res.unwindResult?.success).toBe(true);
          expect(res.unwindResult?.unhedgedResidualDelta).toBe(0);
        } else if (res.state === 'FAILED') {
          // If state is FAILED, either 0 fills happened, or unwind failed
          if (res.unwindResult) {
            expect(res.unwindResult.success).toBe(false);
          }
        }
      }
    });
  });

  // ── 6. ArbitrageRiskGuard Exposure Invariance ────────────────────────────────

  describe('6. Pre-Trade Risk Gate & Exposure Accounting Invariance', () => {
    it('maintains net zero exposure in RiskGuard after an order fails and unwinds', async () => {
      const mockBinance = createMockConnector('binance', {
        placeOrder: vi.fn(async (params: ExchangeOrderParams) => {
          if (params.type === 'market') {
            return {
              orderId: 'unwind-fill',
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
          return {
            orderId: 'b-fill-1',
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
          throw new Error('Bybit crash');
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const riskGuard = new ArbitrageRiskGuard({
        maxPerTradeNotionalUsd: 200000,
        capitalUsdc: 5000000,
        mode: 'paper',
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, { riskGuard });

      const order: MultiLegArbitrageOrder = {
        orderId: 'risk-invariant-order-1',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.2, price: 50000 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', type: 'limit', amount: 0.2, price: 50200 },
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('UNWOUND');

      // Check risk exposures: all open venue and symbol exposures must be exactly 0
      const exposures = riskGuard.getExposures();
      expect(exposures.venues['binance'] ?? 0).toBe(0);
      expect(exposures.venues['bybit'] ?? 0).toBe(0);
      expect(exposures.symbols['BTC/USDT'] ?? 0).toBe(0);
    });

    it('blocks order execution cleanly before touching venues when Quarter-Kelly or notional cap fails', async () => {
      const mockBinance = createMockConnector('binance');
      const resolver = () => mockBinance;

      // Small $1,000 cap
      const riskGuard = new ArbitrageRiskGuard({
        maxPerTradeNotionalUsd: 1000,
        mode: 'paper',
      });

      const coordinator = new AtomicMultiLegCoordinator(resolver, { riskGuard });

      const order: MultiLegArbitrageOrder = {
        orderId: 'risk-block-order',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', amount: 0.5, price: 50000 }, // $25,000 > $1,000
        ],
      };

      const report = await coordinator.execute(order);
      expect(report.state).toBe('FAILED');
      expect(report.error).toContain('EXCEEDS_NOTIONAL_CAP');
      expect(mockBinance.placeOrder).not.toHaveBeenCalled();

      // Exposure must never have been registered
      const exposures = riskGuard.getExposures();
      expect(exposures.venues['binance'] ?? 0).toBe(0);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/execution/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/execution/compensatory-unwind-handler';
import {
  calculateMultiLegRealizedPnl,
  type MultiLegExecutionPlan,
} from '../../../src/desk/arbitrage/execution/atomic-multileg-types';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';

describe('Milestone 3: Atomic Multi-Leg Execution & Compensatory Unwinds', () => {
  const createMockConnector = (overrides?: Partial<IExchangeConnector>): IExchangeConnector => ({
    venue: 'test-venue',
    fetchOrderBook: vi.fn(),
    placeOrder: vi.fn().mockResolvedValue({
      orderId: 'mock-order-1',
      clientOrderId: 'client-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      amount: 1,
      filled: 1,
      status: 'closed',
      timestamp: Date.now(),
    }),
    cancelOrder: vi.fn(),
    fetchBalance: vi.fn(),
    fetchTicker: vi.fn(),
    getLatencyStats: vi.fn().mockReturnValue({ p50: 10, p90: 20, p99: 50 }),
    ...overrides,
  });

  describe('calculateMultiLegRealizedPnl', () => {
    it('calculates realized PnL accurately for buy and sell legs with fees', () => {
      const legs = [
        {
          legId: 'leg-1',
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy' as const,
          requestedAmount: 1,
          filledAmount: 1,
          price: 50000,
          status: 'filled' as const,
          fee: { amount: 5, currency: 'USDT' },
          latencyMs: 12,
        },
        {
          legId: 'leg-2',
          venue: 'polymarket',
          symbol: 'BTC/USDT',
          side: 'sell' as const,
          requestedAmount: 1,
          filledAmount: 1,
          price: 50200,
          status: 'filled' as const,
          fee: { amount: 2, currency: 'USDT' },
          latencyMs: 15,
        },
      ];

      // buyOut = 50000 + 5 = 50005
      // sellIn = 50200 - 2 = 50198
      // pnl = 50198 - 50005 = 193
      const pnl = calculateMultiLegRealizedPnl(legs);
      expect(pnl).toBe(193);
    });
  });

  describe('AtomicMultiLegCoordinator - Concurrent Execution', () => {
    it('completes all legs successfully and reaches FILLED state', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'binance-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1,
          filled: 1,
          status: 'closed',
        }),
      });

      const mockPolymarket = createMockConnector({
        venue: 'polymarket',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'poly-1',
          symbol: 'BTC/USDT',
          side: 'sell',
          type: 'limit',
          price: 50200,
          amount: 1,
          filled: 1,
          status: 'closed',
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockPolymarket);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-101',
        opportunityId: 'opp-101',
        executionStrategy: 'concurrent',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
          { legId: 'leg-p', venue: 'polymarket', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50200, type: 'limit' },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('FILLED');
      expect(result.legs.length).toBe(2);
      expect(result.legs[0].status).toBe('filled');
      expect(result.legs[1].status).toBe('filled');
      expect(result.netRealizedPnlUsd).toBe(200);
      expect(result.unwindReport).toBeUndefined();
    });

    it('triggers compensatory unwind when one leg rejects and reaches UNWOUND state', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'binance-fill',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1,
          filled: 1,
          status: 'closed',
        }),
      });

      const mockPolymarket = createMockConnector({
        venue: 'polymarket',
        placeOrder: vi.fn().mockRejectedValue(new Error('Polymarket order rejected: Insufficient liquidity')),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockPolymarket);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-unwind-1',
        opportunityId: 'opp-unwind-1',
        executionStrategy: 'concurrent',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
          { legId: 'leg-p', venue: 'polymarket', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50200, type: 'limit' },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('UNWOUND');
      expect(result.unwindReport).toBeDefined();
      expect(result.unwindReport?.success).toBe(true);
      // Binance leg had filled 1 BTC, so compensatory unwind placed opposite 'sell' market order
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          type: 'market',
          amount: 1,
        }),
      );
    });

    it('triggers compensatory unwind on leg timeout', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'binance-ok',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1,
          filled: 1,
          status: 'closed',
        }),
      });

      const mockBybit = createMockConnector({
        venue: 'bybit',
        placeOrder: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-timeout-1',
        opportunityId: 'opp-timeout-1',
        executionStrategy: 'concurrent',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
          { legId: 'leg-by', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50100, type: 'limit', timeoutMs: 30 },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('UNWOUND');
      expect(result.unwindReport).toBeDefined();
      expect(result.legs.find((l) => l.legId === 'leg-by')?.status).toBe('failed');
    });

    it('handles partial fills and unwinds the filled portion', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'binance-partial',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 2,
          filled: 0.8,
          status: 'open',
        }),
      });

      const mockKucoin = createMockConnector({
        venue: 'kucoin',
        placeOrder: vi.fn().mockRejectedValue(new Error('KuCoin timeout')),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockKucoin);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-part-1',
        opportunityId: 'opp-part-1',
        legs: [
          { legId: 'leg-b', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 2, price: 50000, type: 'limit' },
          { legId: 'leg-k', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', amount: 2, price: 50200, type: 'limit' },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('UNWOUND');
      expect(mockBinance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 0.8,
          type: 'market',
        }),
      );
    });
  });

  describe('AtomicMultiLegCoordinator - Staged Execution', () => {
    it('executes in stage order and halts subsequent legs on early leg failure', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockRejectedValue(new Error('Stage 1 failed')),
      });

      const mockPolymarket = createMockConnector({
        venue: 'polymarket',
        placeOrder: vi.fn(),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockPolymarket);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-staged-fail',
        opportunityId: 'opp-staged-1',
        executionStrategy: 'staged',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'polymarket', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50200, type: 'limit' },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('UNWOUND');
      expect(mockPolymarket.placeOrder).not.toHaveBeenCalled();
      expect(result.legs.length).toBe(1);
    });

    it('completes all staged legs successfully when each succeeds', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'b-stage-ok',
          symbol: 'ETH/USDT',
          side: 'buy',
          type: 'limit',
          price: 3000,
          amount: 5,
          filled: 5,
          status: 'closed',
        }),
      });

      const mockBybit = createMockConnector({
        venue: 'bybit',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'by-stage-ok',
          symbol: 'ETH/USDT',
          side: 'sell',
          type: 'limit',
          price: 3020,
          amount: 5,
          filled: 5,
          status: 'closed',
        }),
      });

      const resolver = (venue: string) => (venue === 'binance' ? mockBinance : mockBybit);
      const coordinator = new AtomicMultiLegCoordinator(resolver);

      const plan: MultiLegExecutionPlan = {
        executionId: 'exec-staged-ok',
        opportunityId: 'opp-staged-ok',
        executionStrategy: 'staged',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', amount: 5, price: 3000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', amount: 5, price: 3020, type: 'limit' },
        ],
      };

      const result = await coordinator.execute(plan);
      expect(result.state).toBe('FILLED');
      expect(result.netRealizedPnlUsd).toBe(100);
    });
  });

  describe('CompensatoryUnwindHandler Details', () => {
    it('sets state to FAILED if unwind itself fails or connector is missing', async () => {
      const mockBinance = createMockConnector({
        venue: 'binance',
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'binance-init',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1,
          filled: 1,
          status: 'closed',
        }),
      });

      const mockFailingUnwindConnector = createMockConnector({
        venue: 'broken-venue',
        placeOrder: vi.fn().mockRejectedValue(new Error('Connection dropped')),
      });

      const resolver = (venue: string) => {
        if (venue === 'binance') return mockBinance;
        if (venue === 'broken-venue') return mockFailingUnwindConnector;
        return undefined;
      };

      const unwindHandler = new CompensatoryUnwindHandler(resolver);
      const report = await unwindHandler.executeUnwind('exec-fail-unwind', [
        {
          legId: 'leg-broken',
          venue: 'broken-venue',
          symbol: 'BTC/USDT',
          side: 'buy',
          requestedAmount: 1,
          filledAmount: 1,
          price: 50000,
          status: 'partial',
          latencyMs: 10,
        },
      ]);

      expect(report.success).toBe(false);
      expect(report.error).toContain('Connection dropped');
    });

    it('skips legs with zero filled amount during unwind', async () => {
      const resolver = vi.fn();
      const unwindHandler = new CompensatoryUnwindHandler(resolver);

      const report = await unwindHandler.executeUnwind('exec-zero-fill', [
        {
          legId: 'leg-empty',
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          requestedAmount: 1,
          filledAmount: 0,
          price: 50000,
          status: 'failed',
          latencyMs: 10,
        },
      ]);

      expect(report.success).toBe(true);
      expect(report.unwoundLegs.length).toBe(0);
      expect(resolver).not.toHaveBeenCalled();
    });
  });
});

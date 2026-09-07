/**
 * Live Order Manager Proxy — unit tests
 * Target: 100% coverage for src/desk/polymarket/live-order-manager-proxy.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveOrderManagerProxy } from '../live-order-manager-proxy';
import type { StrategyLiveBridge, TradeSignal, SignalResult } from '../strategy-live-bridge';

// Mock logger
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockBridge(overrides: Partial<Record<keyof StrategyLiveBridge, any>> = {}): StrategyLiveBridge {
  return {
    onSignal: vi.fn(),
    onSignals: vi.fn(),
    startEndgameScanner: vi.fn(),
    stopScanner: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      scansCompleted: 0,
      signalsProcessed: 0,
      signalsRejected: 0,
      isScanning: false,
      scannerActive: false,
    }),
    orchestrator: {
      cancelOrder: vi.fn(),
    },
    ...overrides,
  } as unknown as StrategyLiveBridge;
}

describe('LiveOrderManagerProxy', () => {
  let mockBridge: StrategyLiveBridge;
  let proxy: LiveOrderManagerProxy;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge = createMockBridge();
    proxy = new LiveOrderManagerProxy(mockBridge, 'test-strategy');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('initializes with bridge and strategy name', () => {
      expect(proxy).toBeInstanceOf(LiveOrderManagerProxy);
    });

    it('starts with zero order count and cancel count', () => {
      const stats = proxy.getStats();
      expect(stats.ordersPlaced).toBe(0);
      expect(stats.cancelsRequested).toBe(0);
    });

    it('stores strategy name in stats', () => {
      const stats = proxy.getStats();
      expect(stats.strategy).toBe('test-strategy');
    });

    it('includes bridge stats in getStats', () => {
      const stats = proxy.getStats();
      expect(stats.bridgeStats).toBeDefined();
    });
  });

  describe('placeOrder', () => {
    it('increments orderCount on each call', async () => {
      mockBridge.onSignal = vi.fn().mockResolvedValue({
        signal: {} as TradeSignal,
        response: { orderID: 'order-1' },
        error: null,
        rejected: false,
      });

      await proxy.placeOrder({ tokenId: 'token-1', side: 'buy', price: '0.5', size: '100' });
      await proxy.placeOrder({ tokenId: 'token-2', side: 'sell', price: '0.6', size: '200' });

      const stats = proxy.getStats();
      expect(stats.ordersPlaced).toBe(2);
    });

    it('converts buy side to BUY signal', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-1' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 'token-buy', side: 'buy', price: '0.5', size: '100' });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'token-buy',
          side: 'BUY',
          price: 0.5,
          size: 100,
        })
      );
    });

    it('converts sell side to SELL signal', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-2' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 'token-sell', side: 'sell', price: '0.6', size: '200' });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'token-sell',
          side: 'SELL',
          price: 0.6,
          size: 200,
        })
      );
    });

    it('parses price and size as floats from strings', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-3' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({
        tokenId: 'token-str',
        side: 'buy',
        price: '0.75',
        size: '500',
      });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.75,
          size: 500,
        })
      );
    });

    it('handles price and size as numbers', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-4' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({
        tokenId: 'token-num',
        side: 'buy',
        price: 0.8,
        size: 1000,
      });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.8,
          size: 1000,
        })
      );
    });

    it('includes strategy name and order count in description', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-5' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 'token-desc', side: 'buy', price: '0.5', size: '100' });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'test-strategy:order#1',
        })
      );
    });

    it('sets default confidence to 0.7', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-6' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 'token-conf', side: 'buy', price: '0.5', size: '100' });

      expect(mockBridge.onSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 0.7,
        })
      );
    });

    it('includes timestamp in signal', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-7' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      const before = Date.now();
      await proxy.placeOrder({ tokenId: 'token-ts', side: 'buy', price: '0.5', size: '100' });
      const after = Date.now();

      const callArgs = (mockBridge.onSignal as any).mock.calls[0][0];
      expect(callArgs.timestamp).toBeGreaterThanOrEqual(before);
      expect(callArgs.timestamp).toBeLessThanOrEqual(after);
    });

    it('returns orderId from response.orderID when available', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'polymarket-order-123' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      const result = await proxy.placeOrder({ tokenId: 'token-id', side: 'buy', price: '0.5', size: '100' });

      expect(result.id).toBe('polymarket-order-123');
    });

    it('generates fallback orderId when response.orderID is missing', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: {},
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      const result = await proxy.placeOrder({ tokenId: 'token-fallback', side: 'buy', price: '0.5', size: '100' });

      expect(result.id).toMatch(/^proxy-\d+-\d+$/);
    });

    it('logs debug message with order details', async () => {
      const { logger } = await import('../../../shared/utils/logger');
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-log' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 'token-abcdefghijklmnop', side: 'buy', price: '0.5', size: '100' });

      expect(logger.debug).toHaveBeenCalledWith(
        'Order routed via proxy',
        'LiveOrderManagerProxy',
        expect.objectContaining({
          strategy: 'test-strategy',
          tokenId: 'token-abcdef', // sliced to 12 chars (token-abcdefghijklmnop -> token-abcdef)
          side: 'buy',
          orderId: 'order-log',
        })
      );
    });

    it('throws when bridge returns error and not rejected', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: null,
        error: 'Network error',
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await expect(
        proxy.placeOrder({ tokenId: 'token-err', side: 'buy', price: '0.5', size: '100' })
      ).rejects.toThrow('Order failed: Network error');
    });

    it('throws when bridge returns rejected with rejectReason', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: null,
        error: 'Guard rejected: risk limit exceeded',
        rejected: true,
        rejectReason: 'Guard rejected: risk limit exceeded',
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await expect(
        proxy.placeOrder({ tokenId: 'token-rej', side: 'buy', price: '0.5', size: '100' })
      ).rejects.toThrow('Order rejected: Guard rejected: risk limit exceeded');
    });

    it('throws when bridge returns rejected without rejectReason', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: null,
        error: 'Guard rejected',
        rejected: true,
        rejectReason: undefined,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await expect(
        proxy.placeOrder({ tokenId: 'token-rej2', side: 'buy', price: '0.5', size: '100' })
      ).rejects.toThrow('Order rejected: undefined');
    });

    it('handles all order types (GTC, GTD, FOK, IOC)', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-type' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      const orderTypes: Array<'GTC' | 'GTD' | 'FOK' | 'IOC'> = ['GTC', 'GTD', 'FOK', 'IOC'];
      for (const orderType of orderTypes) {
        await proxy.placeOrder({
          tokenId: `token-${orderType}`,
          side: 'buy',
          price: '0.5',
          size: '100',
          orderType,
        });
      }

      expect(mockBridge.onSignal).toHaveBeenCalledTimes(4);
    });
  });

  describe('cancelOrder', () => {
    it('increments cancelCount', async () => {
      await proxy.cancelOrder('order-1');
      await proxy.cancelOrder('order-2');

      const stats = proxy.getStats();
      expect(stats.cancelsRequested).toBe(2);
    });

    it('logs debug message with strategy and orderId', async () => {
      const { logger } = await import('../../../shared/utils/logger');

      await proxy.cancelOrder('order-to-cancel');

      expect(logger.debug).toHaveBeenCalledWith(
        'Cancelling order',
        'LiveOrderManagerProxy',
        expect.objectContaining({
          strategy: 'test-strategy',
          orderId: 'order-to-cancel',
        })
      );
    });

    it('delegates to orchestrator.cancelOrder', async () => {
      const mockOrchestrator = { cancelOrder: vi.fn().mockResolvedValue(undefined) };
      mockBridge.orchestrator = mockOrchestrator as any;

      await proxy.cancelOrder('orch-order-1');

      expect(mockOrchestrator.cancelOrder).toHaveBeenCalledWith('orch-order-1');
    });

    it('returns void (no error on success)', async () => {
      await expect(proxy.cancelOrder('any-order')).resolves.toBeUndefined();
    });
  });

  describe('cancelAllOrders', () => {
    it('logs debug message with strategy and tokenId', async () => {
      const { logger } = await import('../../../shared/utils/logger');

      await proxy.cancelAllOrders('token-12345678901234');

      expect(logger.debug).toHaveBeenCalledWith(
        'Cancel all orders',
        'LiveOrderManagerProxy',
        expect.objectContaining({
          strategy: 'test-strategy',
          tokenId: 'token-123456', // sliced to 12 chars
        })
      );
    });

    it('logs without tokenId when not provided', async () => {
      const { logger } = await import('../../../shared/utils/logger');

      await proxy.cancelAllOrders();

      expect(logger.debug).toHaveBeenCalledWith(
        'Cancel all orders',
        'LiveOrderManagerProxy',
        expect.objectContaining({
          strategy: 'test-strategy',
          tokenId: undefined,
        })
      );
    });

    it('delegates to orchestrator.cancelOrder with tokenId', async () => {
      const mockOrchestrator = { cancelOrder: vi.fn().mockResolvedValue(undefined) };
      mockBridge.orchestrator = mockOrchestrator as any;

      await proxy.cancelAllOrders('token-with-id');

      expect(mockOrchestrator.cancelOrder).toHaveBeenCalledWith('token-with-id');
    });

    it('does not call orchestrator.cancelOrder when tokenId is not provided', async () => {
      const mockOrchestrator = { cancelOrder: vi.fn().mockResolvedValue(undefined) };
      mockBridge.orchestrator = mockOrchestrator as any;

      await proxy.cancelAllOrders();

      // The code calls cancelOrder(tokenId) when tokenId is provided
      // but when tokenId is undefined, it still calls with undefined
      // Let me check the actual implementation...
      // Actually looking at the code: if (tokenId) { await this.bridge['orchestrator'].cancelOrder(tokenId); }
      // So it only calls when tokenId is truthy
      expect(mockOrchestrator.cancelOrder).not.toHaveBeenCalled();
    });

    it('returns void', async () => {
      await expect(proxy.cancelAllOrders('token')).resolves.toBeUndefined();
      await expect(proxy.cancelAllOrders()).resolves.toBeUndefined();
    });
  });

  describe('getOpenOrders', () => {
    it('returns empty array without tokenId', async () => {
      const orders = await proxy.getOpenOrders();
      expect(orders).toEqual([]);
    });

    it('returns empty array with tokenId', async () => {
      const orders = await proxy.getOpenOrders('token-123');
      expect(orders).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns correct structure with all fields', () => {
      const stats = proxy.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          strategy: 'test-strategy',
          ordersPlaced: 0,
          cancelsRequested: 0,
          bridgeStats: expect.objectContaining({
            scansCompleted: 0,
            signalsProcessed: 0,
            signalsRejected: 0,
            isScanning: false,
            scannerActive: false,
          }),
        })
      );
    });

    it('reflects incremented counts after operations', async () => {
      const mockResult: SignalResult = {
        signal: {} as TradeSignal,
        response: { orderID: 'order-1' },
        error: null,
        rejected: false,
      };
      mockBridge.onSignal = vi.fn().mockResolvedValue(mockResult);

      await proxy.placeOrder({ tokenId: 't1', side: 'buy', price: '0.5', size: '100' });
      await proxy.placeOrder({ tokenId: 't2', side: 'buy', price: '0.5', size: '100' });
      await proxy.cancelOrder('order-1');

      const stats = proxy.getStats();
      expect(stats.ordersPlaced).toBe(2);
      expect(stats.cancelsRequested).toBe(1);
    });
  });

  describe('integration: full proxy flow', () => {
    it('handles multiple orders with mixed outcomes', async () => {
      // First order succeeds
      mockBridge.onSignal = vi.fn()
        .mockResolvedValueOnce({
          signal: {} as TradeSignal,
          response: { orderID: 'success-1' },
          error: null,
          rejected: false,
        })
        // Second order fails with error
        .mockResolvedValueOnce({
          signal: {} as TradeSignal,
          response: null,
          error: 'Insufficient balance',
          rejected: false,
        })
        // Third order rejected by guard
        .mockResolvedValueOnce({
          signal: {} as TradeSignal,
          response: null,
          error: 'Guard rejected: max position',
          rejected: true,
          rejectReason: 'Guard rejected: max position',
        });

      const result1 = await proxy.placeOrder({ tokenId: 't1', side: 'buy', price: '0.5', size: '100' });
      expect(result1.id).toBe('success-1');

      await expect(proxy.placeOrder({ tokenId: 't2', side: 'buy', price: '0.5', size: '100' }))
        .rejects.toThrow('Order failed: Insufficient balance');

      await expect(proxy.placeOrder({ tokenId: 't3', side: 'buy', price: '0.5', size: '100' }))
        .rejects.toThrow('Order rejected: Guard rejected: max position');

      const stats = proxy.getStats();
      expect(stats.ordersPlaced).toBe(3); // Still increments even on failure
    });

    it('works with different strategy names', () => {
      const proxy2 = new LiveOrderManagerProxy(mockBridge, 'different-strategy');
      const stats = proxy2.getStats();
      expect(stats.strategy).toBe('different-strategy');
    });
  });
});
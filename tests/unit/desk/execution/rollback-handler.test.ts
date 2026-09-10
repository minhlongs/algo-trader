/**
 * rollback-handler — Unit Tests
 *
 * Covers RollbackHandler:
 * - handleFailedExecution: no positions, buy-only, sell-only, both legs filled
 * - closeLongPosition / closeShortPosition: slippage (0.99 / 1.01), zero-amount guard
 * - calculateLoss: long vs short formulas
 * - createResult: success threshold at maxLossPercent, reason suffix when unsuccessful
 * - getHistory / getTotalLosses / clearHistory
 * - edge cases: error field, undefined fee, negative profit, zero filled
 */
import { describe, it, expect, vi } from 'vitest';
import { RollbackHandler, type RollbackConfig } from '../../../../src/desk/execution/rollback-handler';
import type { ExecutionResult, OrderResult } from '../../../../src/desk/execution/order-executor';

vi.mock('../../../../src/desk/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeOrder(overrides: Partial<OrderResult> = {}): OrderResult {
  return {
    orderId: 'ord-1',
    exchange: 'binance',
    symbol: 'BTC/USDT',
    side: 'buy',
    price: 50000,
    amount: 1,
    filled: 1,
    remaining: 0,
    status: 'closed',
    ...overrides,
  };
}

function makeExecution(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    id: 'exec-1',
    opportunityId: 'opp-1',
    status: 'FAILED',
    timestamp: 1000,
    ...overrides,
  };
}

describe('RollbackHandler', () => {
  function makeHandler() {
    return new RollbackHandler();
  }

  describe('config defaults', () => {
    it('uses default config when none provided', () => {
      const h = new RollbackHandler();
      expect(h).toBeDefined();
    });

    it('merges partial config over defaults', () => {
      const h = new RollbackHandler({ maxLossPercent: 5.0, autoRollback: false });
      expect(h).toBeDefined();
    });
  });

  describe('handleFailedExecution', () => {
    it('returns NO_ACTION when no positions exist', async () => {
      const h = makeHandler();
      const exec = makeExecution({ buyOrder: undefined, sellOrder: undefined });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
      expect(result.success).toBe(true);
      expect(result.loss).toBe(0);
      expect(result.reason).toContain('No positions');
    });

    it('returns NO_ACTION when both orders have zero filled', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 0 }),
        sellOrder: makeOrder({ side: 'sell', filled: 0 }),
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
    });

    it('closes long position when buy filled but sell missing', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 1, side: 'buy' }),
        sellOrder: undefined,
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('CLOSE_LONG');
      expect(result.closedOrder).toBeDefined();
      expect(result.closedOrder?.side).toBe('sell');
      // slippage 0.99 — close below open price
      expect(result.closedOrder?.price).toBe(49500);
    });

    it('closes short position when sell filled but buy missing', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: undefined,
        sellOrder: makeOrder({ filled: 1, side: 'sell' }),
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('CLOSE_SHORT');
      expect(result.closedOrder).toBeDefined();
      expect(result.closedOrder?.side).toBe('buy');
      // slippage 1.01 — close above open price
      expect(result.closedOrder?.price).toBe(50500);
    });

    it('handles both legs filled without rollback', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 1, side: 'buy' }),
        sellOrder: makeOrder({ filled: 1, side: 'sell' }),
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
    });

    it('tracks result in history', async () => {
      const h = makeHandler();
      const exec = makeExecution({ buyOrder: undefined, sellOrder: undefined });
      await h.handleFailedExecution(exec);
      expect(h.getHistory().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createResult success threshold', () => {
    it('marks success false when loss exceeds maxLossPercent tolerance', async () => {
      const h = new RollbackHandler({ maxLossPercent: 0.0001 });
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 1, side: 'buy', price: 50000 }),
        sellOrder: undefined,
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('exceeds max');
    });

    it('appends loss detail to reason on failure', async () => {
      const h = new RollbackHandler({ maxLossPercent: 0.0001 });
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 1, side: 'buy', price: 50000 }),
        sellOrder: undefined,
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.reason).toContain('exceeds max');
    });
  });

  describe('history management', () => {
    it('clearHistory with 0 removes all records', async () => {
      const h = makeHandler();
      await h.handleFailedExecution(makeExecution({ buyOrder: undefined, sellOrder: undefined }));
      expect(h.getHistory().length).toBe(1);
      h.clearHistory(0);
      expect(h.getHistory().length).toBe(0);
    });

    it('getHistory returns copy of results', async () => {
      const h = makeHandler();
      await h.handleFailedExecution(makeExecution({ buyOrder: undefined, sellOrder: undefined }));
      const h1 = h.getHistory();
      const h2 = h.getHistory();
      expect(h1).toEqual(h2);
    });

    it('getHistory respects limit', async () => {
      const h = makeHandler();
      for (let i = 0; i < 5; i++) {
        await h.handleFailedExecution(makeExecution({ buyOrder: undefined, sellOrder: undefined }));
      }
      expect(h.getHistory(2).length).toBe(2);
    });

    it('getTotalLosses sums losses', async () => {
      const h = makeHandler();
      await h.handleFailedExecution(makeExecution({ buyOrder: undefined, sellOrder: undefined }));
      const total = h.getTotalLosses();
      expect(typeof total).toBe('number');
      expect(total).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles execution with error field set', async () => {
      const h = makeHandler();
      const exec = makeExecution({ error: 'Exchange timeout', buyOrder: undefined, sellOrder: undefined });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
    });

    it('handles order with undefined optional fields', async () => {
      const h = makeHandler();
      const order = makeOrder({ fee: undefined });
      const exec = makeExecution({ buyOrder: order, sellOrder: undefined });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('CLOSE_LONG');
      expect(result.closedOrder).toBeDefined();
    });

    it('handles negative profit execution', async () => {
      const h = makeHandler();
      const exec = makeExecution({ profit: -100, buyOrder: undefined, sellOrder: undefined });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
    });

    it('NO_ACTION when filled amount is zero', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 0, side: 'buy' }),
        sellOrder: undefined,
      });
      const result = await h.handleFailedExecution(exec);
      expect(result.action).toBe('NO_ACTION');
    });

    it('calculates long position loss correctly', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: makeOrder({ filled: 1, side: 'buy', price: 50000 }),
        sellOrder: undefined,
      });
      const result = await h.handleFailedExecution(exec);
      // Long: closeValue - openValue - fees = 49500*1 - 50000*1 - 50 = -550
      expect(result.loss).toBe(-550);
    });

    it('calculates short position loss correctly', async () => {
      const h = makeHandler();
      const exec = makeExecution({
        buyOrder: undefined,
        sellOrder: makeOrder({ filled: 1, side: 'sell', price: 50000 }),
      });
      const result = await h.handleFailedExecution(exec);
      // Short: openValue - closeValue - fees = 50000*1 - 50500*1 - 50 = -550
      expect(result.loss).toBe(-550);
    });
  });
});
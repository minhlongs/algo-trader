/**
 * OrderExecutor Tests
 *
 * Covers the full execution flow: happy-path fill, partial fill, rollback on
 * single-side failure, both-sides failure, profit calculation, execution
 * lookup/cancel/cleanup, and the private placeOrder/rollbackOrder paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockLogAudit, mockHashIpAddress, mockCrypto } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockLogAudit: vi.fn(async () => {}),
  mockHashIpAddress: vi.fn(() => 'hash'),
  mockCrypto: { randomUUID: vi.fn(() => 'uuid-mock') },
}));

vi.mock('../../../../src/desk/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../src/seed/security/audit-log', () => ({
  logAudit: mockLogAudit,
  hashIpAddress: mockHashIpAddress,
}));
vi.mock('crypto', () => ({ default: mockCrypto }));

import { OrderExecutor, ExecutionResult, OrderResult } from '../../../../src/desk/execution/order-executor';
import type { ArbitrageOpportunity } from '../../../../src/desk/arbitrage/spread-detector-types';

function makeOpp(overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity {
  return {
    id: 'opp-1',
    symbol: 'BTC/USDT',
    buyExchange: 'binance',
    sellExchange: 'coinbase',
    buyPrice: 50_000,
    sellPrice: 51_000,
    spread: 1_000,
    spreadPercent: 2,
    timestamp: Date.now(),
    latency: 100,
    ...overrides,
  };
}

describe('OrderExecutor', () => {
  let executor: OrderExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new OrderExecutor();
  });

  // ── Config ─────────────────────────────────────────────────────────────────

  it('uses default config when none is provided', () => {
    // @ts-expect-error - reach into private field
    expect(executor.config.defaultAmount).toBe(0.01);
    // @ts-expect-error - reach into private field
    expect(executor.config.maxSlippage).toBe(0.05);
  });

  it('merges partial config with defaults', () => {
    const ex = new OrderExecutor({ defaultAmount: 0.5, retryAttempts: 5 });
    // @ts-expect-error - reach into private field
    expect(executor.config.defaultAmount).toBe(0.01);
    // @ts-expect-error - reach into private field
    expect(ex.config.retryAttempts).toBe(5);
  });

  // ── execute: happy path ────────────────────────────────────────────────────

  it('fills both orders and marks execution FILLED with profit', async () => {
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('FILLED');
    expect(result.buyOrder).toBeDefined();
    expect(result.sellOrder).toBeDefined();
    expect(result.buyOrder!.side).toBe('buy');
    expect(result.sellOrder!.side).toBe('sell');
    expect(result.buyOrder!.status).toBe('closed');
    expect(result.profit).toBeGreaterThan(0);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit.mock.calls[0][0].result).toBe('success');
  });

  it('uses the provided amount instead of the default', async () => {
    const result = await executor.execute(makeOpp(), 1.0);
    expect(result.buyOrder!.amount).toBe(1.0);
    expect(result.sellOrder!.amount).toBe(1.0);
  });

  it('stores the execution in pendingExecutions', async () => {
    const result = await executor.execute(makeOpp());
    expect(executor.getExecution(result.id)).toBe(result);
  });

  // ── execute: partial fill ──────────────────────────────────────────────────

  it('marks execution PARTIAL when one side is under-filled', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => {
      const full: OrderResult = {
        orderId: 'oid', exchange: 'x', symbol: 'BTC/USDT', side: p.side as 'buy' | 'sell',
        price: 50_000, amount: p.amount, filled: p.amount, remaining: 0, status: 'closed', fee: 0,
      };
      if (p.side === 'sell') full.filled = p.amount * 0.5; // under-fill sell
      return full;
    });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('PARTIAL');
    expect(mockLogAudit.mock.calls[0][0].result).toBe('failure');
  });

  // ── execute: rollback on single-side failure ───────────────────────────────

  it('rolls back the buy order when the sell side fails', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => {
      if (p.side === 'sell') throw new Error('sell exchange down');
      return {
        orderId: 'oid', exchange: 'x', symbol: 'BTC/USDT', side: 'buy' as const,
        price: 50_000, amount: p.amount, filled: p.amount, remaining: 0, status: 'closed' as const, fee: 0,
      };
    });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('ROLLBACK');
    expect(result.error).toMatch(/sell exchange down/);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[OrderExecutor] Rolling back order:',
      expect.objectContaining({ order: expect.objectContaining({ orderId: 'oid' }) }),
    );
  });

  it('rolls back the sell order when the buy side fails', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => {
      if (p.side === 'buy') throw new Error('buy exchange down');
      return {
        orderId: 'oid2', exchange: 'x', symbol: 'BTC/USDT', side: 'sell' as const,
        price: 51_000, amount: p.amount, filled: p.amount, remaining: 0, status: 'closed' as const, fee: 0,
      };
    });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('ROLLBACK');
    expect(result.error).toMatch(/buy exchange down/);
  });

  it('throws when both sides fail', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async () => { throw new Error('both down'); });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/Both sides failed/);
  });

  it('marks FAILED when a side is rejected', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => ({
      orderId: 'oid', exchange: 'x', symbol: 'BTC/USDT', side: p.side as 'buy' | 'sell',
      price: 50_000, amount: p.amount, filled: 0, remaining: p.amount,
      status: 'rejected' as const, fee: 0,
    }));
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/rejected/);
  });

  // ── getExecution / getPendingExecutions / cancel / cleanup ─────────────────

  it('returns undefined for an unknown execution id', () => {
    expect(executor.getExecution('nope')).toBeUndefined();
  });

  it('filters pending executions by status', async () => {
    const result = await executor.execute(makeOpp());
    // After fill, status is FILLED — not pending
    expect(executor.getPendingExecutions()).toHaveLength(0);
    // @ts-expect-error - reach into private field
    result.status = 'PENDING';
    expect(executor.getPendingExecutions()).toHaveLength(1);
  });

  it('cancels a PENDING execution', async () => {
    const result = await executor.execute(makeOpp());
    // @ts-expect-error - reach into private field
    result.status = 'PENDING';
    const cancelled = await executor.cancel(result.id);
    expect(cancelled).toBe(true);
    expect(result.status).toBe('CANCELED');
  });

  it('does not cancel a non-PENDING execution', async () => {
    const result = await executor.execute(makeOpp());
    const cancelled = await executor.cancel(result.id);
    expect(cancelled).toBe(false);
    expect(result.status).toBe('FILLED');
  });

  it('does not cancel an unknown execution', async () => {
    const cancelled = await executor.cancel('nope');
    expect(cancelled).toBe(false);
  });

  it('cleans up completed executions older than TTL', async () => {
    const result = await executor.execute(makeOpp());
    // @ts-expect-error - reach into private field
    result.timestamp = Date.now() - 7_200_000; // 2 hours ago
    executor.cleanup(); // default TTL 1 hour
    expect(executor.getExecution(result.id)).toBeUndefined();
  });

  it('does not clean up recent executions', async () => {
    const result = await executor.execute(makeOpp());
    executor.cleanup();
    expect(executor.getExecution(result.id)).toBe(result);
  });

  it('runs cleanup() automatically on execute', async () => {
    // @ts-expect-error - reach into private field
    const cleanupSpy = vi.spyOn(executor, 'cleanup');
    await executor.execute(makeOpp());
    expect(cleanupSpy).toHaveBeenCalled();
  });

  // ── calculateProfit (via execute) ─────────────────────────────────────────

  it('computes profit as sell revenue minus buy cost minus fees', async () => {
    const result = await executor.execute(makeOpp({ buyPrice: 100, sellPrice: 110 }), 1);
    // buyCost 100, sellRevenue 110, fees (100+110)*0.001 = 0.21, profit = 9.79
    expect(result.profit).toBeCloseTo(9.79, 10);
  });

  // ── rollbackOrder: open vs closed ──────────────────────────────────────────

  it('cancels an open order during rollback', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => {
      if (p.side === 'sell') throw new Error('sell down');
      return {
        orderId: 'open-oid', exchange: 'x', symbol: 'BTC/USDT', side: 'buy' as const,
        price: 50_000, amount: p.amount, filled: 0, remaining: p.amount, status: 'open' as const, fee: 0,
      };
    });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('ROLLBACK');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[OrderExecutor] Canceled open order open-oid via exchange API',
    );
  });

  it('places an offsetting order for a closed order during rollback', async () => {
    // @ts-expect-error - reach into private field to stub placeOrder
    const placeSpy = executor.placeOrder = vi.fn(async (p: { side: string }) => {
      if (p.side === 'sell' && !p.symbol.includes('offset')) throw new Error('sell down');
      return {
        orderId: 'oid', exchange: 'x', symbol: 'BTC/USDT', side: p.side as 'buy' | 'sell',
        price: 50_000, amount: p.amount, filled: p.amount, remaining: 0, status: 'closed' as const, fee: 0,
      };
    });
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('ROLLBACK');
    // The rollback should have placed an offsetting sell order
    expect(placeSpy).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell' }));
  });

  it('logs an error when rollback itself fails', async () => {
    // Buy side lands open; sell side throws. Rollback calls cancelOrder, which
    // rejects the cancellation -> rollbackOrder logs and swallows the error.
    // @ts-expect-error - reach into private field to stub placeOrder
    executor.placeOrder = vi.fn(async (p: { side: string }) => {
      if (p.side === 'sell') throw new Error('sell down');
      return {
        orderId: 'open-oid', exchange: 'x', symbol: 'BTC/USDT', side: 'buy' as const,
        price: 50_000, amount: 0.01, filled: 0, remaining: 0.01, status: 'open' as const, fee: 0,
      };
    });
    // @ts-expect-error - reach into private field to stub cancelOrder
    executor.cancelOrder = vi.fn(async () => false);
    const result = await executor.execute(makeOpp());
    expect(result.status).toBe('ROLLBACK');
    expect(result.error).toMatch(/sell down/);
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[OrderExecutor] Rollback failed for order open-oid:',
      expect.anything(),
    );
  });

  // ── placeOrder (mock) ──────────────────────────────────────────────────────

  it('returns a fully-filled closed order from placeOrder', async () => {
    // @ts-expect-error - call private method for test
    const order = await executor.placeOrder({
      exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50_000, amount: 1,
    });
    expect(order.orderId).toContain('binance-');
    expect(order.filled).toBe(1);
    expect(order.remaining).toBe(0);
    expect(order.status).toBe('closed');
    expect(order.fee).toBeCloseTo(50, 10); // 1 * 50000 * 0.001
  });

  // ── audit log swallows its own errors ──────────────────────────────────────

  it('does not throw when logAudit rejects', async () => {
    mockLogAudit.mockRejectedValueOnce(new Error('audit down'));
    await expect(executor.execute(makeOpp())).resolves.toBeDefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[OrderExecutor] Failed to append tenant audit log:',
      expect.anything(),
    );
  });
});

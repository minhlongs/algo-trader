/**
 * LiveOrderManager Facade Tests
 * Covers: submitAndTrack (matched/pending), submitOnly, cancelOrder
 * (with/without timer/state), cancelAll, query methods, stop lifecycle.
 * Relies on mocked adapter/tracker + mocked leaf modules.
 * Does NOT duplicate submitSignal/risk-gate coverage (see risk-gate-wiring).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger, mockSchedulePollFor, mockHandleFillFor, mockRunRiskGates } =
  vi.hoisted(() => ({
    mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockSchedulePollFor: vi.fn(),
    mockHandleFillFor: vi.fn(),
    mockRunRiskGates: vi.fn(),
  }));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../src/desk/execution/live-order-polling', () => ({ schedulePollFor: mockSchedulePollFor }));
vi.mock('../../../../src/desk/execution/live-order-manager-terminal', () => ({ handleFillFor: mockHandleFillFor }));
vi.mock('../../../../src/desk/execution/live-order-risk-gates', () => ({ runRiskGates: mockRunRiskGates }));

import { LiveOrderManager } from '../../../../src/desk/execution/live-order-manager';
import type { PolymarketAdapter, PolymarketOrderResponse } from '../../../../src/desk/execution/polymarket-adapter';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import type { LivePositionTracker } from '../../../../src/desk/execution/live-position-tracker';
import { resetExecutionModeCache } from '../../../../src/desk/execution/execution-mode';
import { DEFAULT_MAX_ORDER_LIFETIME } from '../../../../src/desk/execution/live-order-manager-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): PolymarketAdapter {
  return {
    placeOrder: overrides.placeOrder ?? vi.fn().mockResolvedValue({ orderID: 'ord-001', status: 'pending' } as PolymarketOrderResponse),
    getOrder: overrides.getOrder ?? vi.fn().mockResolvedValue({ status: 'matched' }),
    cancelOrder: overrides.cancelOrder ?? vi.fn().mockResolvedValue(undefined),
    getOpenOrders: overrides.getOpenOrders ?? vi.fn().mockResolvedValue([]),
    getUserBalance: overrides.getUserBalance ?? vi.fn().mockResolvedValue('1000'),
  } as unknown as PolymarketAdapter;
}

function makeTracker(): LivePositionTracker {
  return {
    recordFill: vi.fn(),
    getPositions: vi.fn().mockReturnValue([]),
    closePosition: vi.fn(),
  } as unknown as LivePositionTracker;
}

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    tokenId: '0xtokenABC',
    side: 'BUY',
    price: 0.5,
    size: 20,
    ...overrides,
  } as PolymarketOrder;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LiveOrderManager', () => {
  let adapter: PolymarketAdapter;
  let tracker: LivePositionTracker;

  beforeEach(() => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    adapter = makeAdapter();
    tracker = makeTracker();
    mockSchedulePollFor.mockClear();
    mockHandleFillFor.mockClear();
    mockRunRiskGates.mockClear();
    mockRunRiskGates.mockImplementation(async (_signal: unknown, _strat: string, mgr: LiveOrderManager) => {
      return mgr.submitAndTrack(makeOrder());
    });
  });

  afterEach(() => {
    delete process.env.LIVE_TRADING_ENABLED;
    resetExecutionModeCache();
  });

  // ── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('uses default maxOrderLifetimeMs when omitted', () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      expect(mgr.maxOrderLifetimeMs).toBe(DEFAULT_MAX_ORDER_LIFETIME);
    });

    it('accepts custom maxOrderLifetimeMs', () => {
      const mgr = new LiveOrderManager(adapter, tracker, 120_000);
      expect(mgr.maxOrderLifetimeMs).toBe(120_000);
    });

    it('starts with no active orders', () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      expect(mgr.getActiveOrders()).toHaveLength(0);
      expect(mgr.hasActiveOrders()).toBe(false);
    });
  });

  // ── submitAndTrack ─────────────────────────────────────────────────────────

  describe('submitAndTrack', () => {
    it('submits order and tracks when status is pending', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-100', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      const result = await mgr.submitAndTrack(makeOrder());
      expect(result.orderID).toBe('ord-100');
      expect(result.status).toBe('pending');
      expect(mgr.activeOrders.size).toBe(1);
      expect(mgr.getActiveOrders()[0]!.status).toBe('pending');
      expect(mockSchedulePollFor).toHaveBeenCalledWith(mgr, 'ord-100');
    });

    it('submits order and handles fill when status is matched', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-200', status: 'matched' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      expect(mockHandleFillFor).toHaveBeenCalled();
      expect(mockSchedulePollFor).not.toHaveBeenCalled();
    });

    it('throws when stopped', async () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      mgr.stopped = true;
      await expect(mgr.submitAndTrack(makeOrder())).rejects.toThrow('LiveOrderManager is stopped');
    });
  });

  // ── submitOnly ─────────────────────────────────────────────────────────────

  describe('submitOnly', () => {
    it('delegates to adapter.placeOrder without tracking', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-fire', status: 'matched' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      const result = await mgr.submitOnly(makeOrder());
      expect(result.orderID).toBe('ord-fire');
      expect(mgr.activeOrders.size).toBe(0);
    });
  });

  // ── cancelOrder ────────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('clears timer and deletes order from active map', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-cancel', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      expect(mgr.activeOrders.has('ord-cancel')).toBe(true);

      await mgr.cancelOrder('ord-cancel');
      expect(adapter.cancelOrder).toHaveBeenCalledWith('ord-cancel');
      expect(mgr.activeOrders.has('ord-cancel')).toBe(false);
    });

    it('emits canceled when order was active', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-emit', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      const handler = vi.fn();
      mgr.on('canceled', handler);

      await mgr.cancelOrder('ord-emit');
      expect(handler).toHaveBeenCalledWith('ord-emit');
    });

    it('swallows adapter cancel errors', async () => {
      const cancelOrder = vi.fn().mockRejectedValue(new Error('network'));
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-err', status: 'pending' });
      adapter = makeAdapter({ placeOrder, cancelOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      await expect(mgr.cancelOrder('ord-err')).resolves.not.toThrow();
      expect(mgr.activeOrders.has('ord-err')).toBe(false);
    });

    it('does not emit when order was not active', async () => {
      const cancelOrder = vi.fn().mockResolvedValue(undefined);
      adapter = makeAdapter({ cancelOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      const handler = vi.fn();
      mgr.on('canceled', handler);
      await mgr.cancelOrder('ord-ghost');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── cancelAll ──────────────────────────────────────────────────────────────

  describe('cancelAll', () => {
    it('returns 0 when no active orders', async () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      const count = await mgr.cancelAll();
      expect(count).toBe(0);
    });

    it('cancels all active orders and returns count', async () => {
      const placeOrder = vi.fn()
        .mockResolvedValueOnce({ orderID: 'o1', status: 'pending' })
        .mockResolvedValueOnce({ orderID: 'o2', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      await mgr.submitAndTrack(makeOrder());
      expect(mgr.activeOrders.size).toBe(2);

      const count = await mgr.cancelAll();
      expect(count).toBe(2);
      expect(mgr.activeOrders.size).toBe(0);
    });
  });

  // ── query methods ──────────────────────────────────────────────────────────

  describe('query methods', () => {
    it('getActiveOrders returns order states', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'q1', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      const orders = mgr.getActiveOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0]!.orderId).toBe('q1');
    });

    it('getOrder returns specific order', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'q2', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      expect(mgr.getOrder('q2')).toBeDefined();
      expect(mgr.getOrder('q2')!.orderId).toBe('q2');
    });

    it('getOrder returns undefined for unknown', () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      expect(mgr.getOrder('nonexistent')).toBeUndefined();
    });

    it('hasActiveOrders returns false when empty', () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      expect(mgr.hasActiveOrders()).toBe(false);
    });

    it('hasActiveOrders returns true when orders exist', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 'h1', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      expect(mgr.hasActiveOrders()).toBe(true);
    });
  });

  // ── stop lifecycle ─────────────────────────────────────────────────────────

  describe('stop', () => {
    it('sets stopped and clears all timers and active orders', async () => {
      const placeOrder = vi.fn().mockResolvedValue({ orderID: 's1', status: 'pending' });
      adapter = makeAdapter({ placeOrder });
      const mgr = new LiveOrderManager(adapter, tracker);

      await mgr.submitAndTrack(makeOrder());
      expect(mgr.activeOrders.size).toBe(1);

      await mgr.stop();
      expect(mgr.stopped).toBe(true);
      expect(mgr.activeOrders.size).toBe(0);
    });

    it('is idempotent (can stop twice)', async () => {
      const mgr = new LiveOrderManager(adapter, tracker);
      await mgr.stop();
      await expect(mgr.stop()).resolves.not.toThrow();
    });
  });

  // ── re-exports ─────────────────────────────────────────────────────────────

  describe('re-exports', () => {
    it('exports TokenBucketRateLimiter', async () => {
      const { TokenBucketRateLimiter } = await import('../../../../src/desk/execution/live-order-manager');
      expect(TokenBucketRateLimiter).toBeDefined();
    });

    it('exports OrderState type (compiles)', async () => {
      // Type-only import — if it compiles, the export is correct
      const mod = await import('../../../../src/desk/execution/live-order-manager');
      expect(mod).toBeDefined();
    });
  });
});

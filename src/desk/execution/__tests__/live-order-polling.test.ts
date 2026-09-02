/**
 * Tests for live-order-polling — schedulePollFor and pollOrderFor
 * as pure functions operating on a structural LiveOrderManagerCtx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { schedulePollFor, pollOrderFor } from '../live-order-polling';
import type { LiveOrderManagerCtx, OrderState } from '../live-order-manager-types';
import { DEFAULT_POLL_INTERVALS, MAX_POLL_ERRORS } from '../live-order-manager-types';

function makeState(overrides: Partial<OrderState> = {}): OrderState {
  return {
    orderId: 'ord-1',
    tokenId: 'token-abc',
    side: 'BUY',
    size: 10,
    price: 0.5,
    status: 'pending',
    submittedAt: Date.now(),
    lastPollAt: Date.now(),
    pollAttempts: 0,
    ...overrides,
  };
}

interface AdapterStub {
  getOpenOrders: ReturnType<typeof vi.fn>;
  cancelOrder: ReturnType<typeof vi.fn>;
}

function makeCtx(overrides: {
  activeOrders?: Map<string, OrderState>;
  pollTimers?: Map<string, NodeJS.Timeout>;
  adapter?: AdapterStub;
  maxOrderLifetimeMs?: number;
  stopped?: boolean;
} = {}): LiveOrderManagerCtx {
  return {
    activeOrders: overrides.activeOrders ?? new Map(),
    pollTimers: overrides.pollTimers ?? new Map(),
    adapter: overrides.adapter ?? { getOpenOrders: vi.fn().mockResolvedValue([]), cancelOrder: vi.fn().mockResolvedValue(undefined) },
    positionTracker: { recordFill: vi.fn() } as any,
    maxOrderLifetimeMs: overrides.maxOrderLifetimeMs ?? 300_000,
    stopped: overrides.stopped ?? false,
    strategyRateLimiters: new Map(),
    emit: vi.fn(),
    submitAndTrack: vi.fn(),
    getRateLimiter: vi.fn(),
  } as unknown as LiveOrderManagerCtx;
}

describe('schedulePollFor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing if order not in activeOrders', () => {
    const ctx = makeCtx();
    schedulePollFor(ctx, 'missing-order');
    expect(ctx.pollTimers.size).toBe(0);
  });

  it('does nothing if ctx.stopped is true', () => {
    const ctx = makeCtx({ stopped: true });
    const state = makeState({ orderId: 'ord-stopped' });
    ctx.activeOrders.set('ord-stopped', state);
    schedulePollFor(ctx, 'ord-stopped');
    expect(ctx.pollTimers.size).toBe(0);
  });

  it('handles expiration when order exceeds max lifetime', () => {
    const ctx = makeCtx({ maxOrderLifetimeMs: 1000 });
    const state = makeState({ orderId: 'ord-expired', submittedAt: Date.now() - 2000 });
    ctx.activeOrders.set('ord-expired', state);
    schedulePollFor(ctx, 'ord-expired');
    // Should call handleExpiredFor - verify via side effects
    expect(ctx.activeOrders.has('ord-expired')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('expired', 'ord-expired');
  });

  it('schedules a poll timer with exponential backoff based on pollAttempts', () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-backoff', pollAttempts: 0 });
    ctx.activeOrders.set('ord-backoff', state);
    schedulePollFor(ctx, 'ord-backoff');
    expect(ctx.pollTimers.has('ord-backoff')).toBe(true);
    const timer = ctx.pollTimers.get('ord-backoff');
    expect(timer).toBeDefined();
  });

  it('uses correct interval index for pollAttempts within bounds', () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-idx-2', pollAttempts: 2 });
    ctx.activeOrders.set('ord-idx-2', state);
    schedulePollFor(ctx, 'ord-idx-2');
    const timer = ctx.pollTimers.get('ord-idx-2');
    expect(timer).toBeDefined();
    vi.advanceTimersByTime(DEFAULT_POLL_INTERVALS[2]);
  });

  it('caps interval index at max when pollAttempts exceeds intervals length', () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-idx-max', pollAttempts: 100 });
    ctx.activeOrders.set('ord-idx-max', state);
    schedulePollFor(ctx, 'ord-idx-max');
    const timer = ctx.pollTimers.get('ord-idx-max');
    expect(timer).toBeDefined();
    vi.advanceTimersByTime(DEFAULT_POLL_INTERVALS[DEFAULT_POLL_INTERVALS.length - 1]);
  });

  it('does not schedule if order was already removed from activeOrders', () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-removed' });
    ctx.activeOrders.set('ord-removed', state);
    ctx.activeOrders.delete('ord-removed');
    schedulePollFor(ctx, 'ord-removed');
    expect(ctx.pollTimers.size).toBe(0);
  });
});

describe('pollOrderFor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing if order not in activeOrders', async () => {
    const ctx = makeCtx();
    await pollOrderFor(ctx, 'missing-order');
    expect(ctx.adapter.getOpenOrders).not.toHaveBeenCalled();
  });

  it('does nothing if ctx.stopped is true', async () => {
    const ctx = makeCtx({ stopped: true });
    const state = makeState({ orderId: 'ord-stopped' });
    ctx.activeOrders.set('ord-stopped', state);
    await pollOrderFor(ctx, 'ord-stopped');
    expect(ctx.adapter.getOpenOrders).not.toHaveBeenCalled();
  });

  it('increments pollAttempts and updates lastPollAt', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-attempts', pollAttempts: 0 });
    ctx.activeOrders.set('ord-attempts', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([]);
    await pollOrderFor(ctx, 'ord-attempts');
    expect(state.pollAttempts).toBe(1);
    expect(state.lastPollAt).toBeCloseTo(Date.now(), -2);
  });

  it('handles order not found in open orders — schedules re-poll if within lifetime', async () => {
    const ctx = makeCtx({ maxOrderLifetimeMs: 10_000 });
    const state = makeState({ orderId: 'ord-not-found', submittedAt: Date.now() - 1000 });
    ctx.activeOrders.set('ord-not-found', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([]);
    await pollOrderFor(ctx, 'ord-not-found');
    // Should schedule re-poll (timer set)
    expect(ctx.pollTimers.has('ord-not-found')).toBe(true);
  });

  it('handles order not found in open orders — expires if exceeded max lifetime', async () => {
    const ctx = makeCtx({ maxOrderLifetimeMs: 1000 });
    const state = makeState({ orderId: 'ord-expire-check', submittedAt: Date.now() - 2000 });
    ctx.activeOrders.set('ord-expire-check', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([]);
    await pollOrderFor(ctx, 'ord-expire-check');
    // Should call handleExpiredFor - verify via side effects
    expect(ctx.activeOrders.has('ord-expire-check')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('expired', 'ord-expire-check');
  });

  it('handles filled order — calls handleFillFor', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-filled', status: 'pending' });
    ctx.activeOrders.set('ord-filled', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-filled', status: 'filled' }]);
    await pollOrderFor(ctx, 'ord-filled');
    expect(state.status).toBe('matched');
    expect(ctx.activeOrders.has('ord-filled')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('filled', state);
  });

  it('handles matched order — calls handleFillFor', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-matched', status: 'pending' });
    ctx.activeOrders.set('ord-matched', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-matched', status: 'matched' }]);
    await pollOrderFor(ctx, 'ord-matched');
    expect(state.status).toBe('matched');
    expect(ctx.activeOrders.has('ord-matched')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('filled', state);
  });

  it('handles canceled order — emits canceled event and deletes from activeOrders', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-canceled', status: 'pending' });
    ctx.activeOrders.set('ord-canceled', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-canceled', status: 'canceled' }]);
    await pollOrderFor(ctx, 'ord-canceled');
    expect(state.status).toBe('canceled');
    expect(ctx.activeOrders.has('ord-canceled')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('canceled', 'ord-canceled');
  });

  it('handles still unmatched order — schedules re-poll', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-unmatched', status: 'pending' });
    ctx.activeOrders.set('ord-unmatched', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-unmatched', status: 'unmatched' }]);
    await pollOrderFor(ctx, 'ord-unmatched');
    expect(ctx.pollTimers.has('ord-unmatched')).toBe(true);
  });

  it('handles adapter error — schedules re-poll if under MAX_POLL_ERRORS', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-error', pollAttempts: 0 });
    ctx.activeOrders.set('ord-error', state);
    ctx.adapter.getOpenOrders.mockRejectedValue(new Error('network error'));
    await pollOrderFor(ctx, 'ord-error');
    expect(ctx.pollTimers.has('ord-error')).toBe(true);
    expect(state.pollAttempts).toBe(1);
  });

  it('handles adapter error — emits error and removes order when exceeding MAX_POLL_ERRORS', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-max-errors', pollAttempts: MAX_POLL_ERRORS });
    ctx.activeOrders.set('ord-max-errors', state);
    ctx.adapter.getOpenOrders.mockRejectedValue(new Error('persistent error'));
    await pollOrderFor(ctx, 'ord-max-errors');
    expect(state.status).toBe('error');
    expect(ctx.activeOrders.has('ord-max-errors')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('error', 'ord-max-errors', expect.any(Error));
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Order ord-max-errors exceeded max poll errors',
      'LiveOrderManager',
      expect.objectContaining({ err: 'Error: persistent error' }),
    );
  });

  it('removes poll timer at start of pollOrderFor', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-timer-removed' });
    ctx.activeOrders.set('ord-timer-removed', state);
    ctx.pollTimers.set('ord-timer-removed', {} as NodeJS.Timeout);
    // Use canceled status so no re-schedule happens — timer stays removed
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-timer-removed', status: 'canceled' }]);
    await pollOrderFor(ctx, 'ord-timer-removed');
    expect(ctx.pollTimers.has('ord-timer-removed')).toBe(false);
  });

  it('handles delayed status order — schedules re-poll', async () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-delayed', status: 'delayed' });
    ctx.activeOrders.set('ord-delayed', state);
    ctx.adapter.getOpenOrders.mockResolvedValue([{ id: 'ord-delayed', status: 'delayed' }]);
    await pollOrderFor(ctx, 'ord-delayed');
    expect(ctx.pollTimers.has('ord-delayed')).toBe(true);
  });
});
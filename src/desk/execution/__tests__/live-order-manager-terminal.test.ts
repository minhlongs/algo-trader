/**
 * Tests for live-order-manager-terminal — handleFillFor and handleExpiredFor
 * as pure functions operating on a structural LiveOrderManagerCtx.
 *
 * Logger is mocked; the ctx and its adapter/positionTracker are stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { handleFillFor, handleExpiredFor } from '../live-order-manager-terminal';
import type { LiveOrderManagerCtx, OrderState } from '../live-order-manager-types';

function makeState(overrides: Partial<OrderState> = {}): OrderState {
  return {
    orderId: 'ord-1',
    tokenId: 'token-abc',
    side: 'BUY',
    size: 10,
    price: 0.5,
    status: 'pending',
    submittedAt: 1,
    lastPollAt: 1,
    pollAttempts: 0,
    ...overrides,
  };
}

interface AdapterStub {
  cancelOrder: ReturnType<typeof vi.fn>;
}

interface TrackerStub {
  recordFill: ReturnType<typeof vi.fn>;
}

function makeCtx(overrides: {
  activeOrders?: Map<string, OrderState>;
  pollTimers?: Map<string, NodeJS.Timeout>;
  adapter?: AdapterStub;
  positionTracker?: TrackerStub;
} = {}): LiveOrderManagerCtx {
  return {
    activeOrders: overrides.activeOrders ?? new Map(),
    pollTimers: overrides.pollTimers ?? new Map(),
    adapter: overrides.adapter ?? { cancelOrder: vi.fn().mockResolvedValue(undefined) },
    positionTracker: overrides.positionTracker ?? { recordFill: vi.fn() },
    maxOrderLifetimeMs: 300_000,
    stopped: false,
    strategyRateLimiters: new Map(),
    emit: vi.fn(),
    submitAndTrack: vi.fn(),
    getRateLimiter: vi.fn(),
  } as unknown as LiveOrderManagerCtx;
}

describe('handleFillFor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the poll timer, records the fill, and deletes the active order', () => {
    const ctx = makeCtx();
    const state = makeState({ orderId: 'ord-9', tokenId: 'tok-xyz' });
    ctx.activeOrders.set('ord-9', state);
    ctx.pollTimers.set('ord-9', {} as NodeJS.Timeout);

    handleFillFor(ctx, state);

    expect(ctx.pollTimers.has('ord-9')).toBe(false);
    expect(ctx.positionTracker.recordFill).toHaveBeenCalledWith({
      tokenId: 'tok-xyz',
      side: 'BUY',
      size: 10,
      price: 0.5,
      filledAt: expect.any(Number),
      orderId: 'ord-9',
    });
    expect(ctx.activeOrders.has('ord-9')).toBe(false);
  });

  it('emits a filled event and logs the fill', () => {
    const ctx = makeCtx();
    const state = makeState();
    handleFillFor(ctx, state);
    expect(ctx.emit).toHaveBeenCalledWith('filled', state);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Order ord-1 filled',
      'LiveOrderManager',
      expect.objectContaining({ tokenId: 'token-abc', side: 'BUY', size: 10, price: 0.5 }),
    );
  });

  it('truncates the tokenId in the log to 12 chars', () => {
    const ctx = makeCtx();
    const state = makeState({ tokenId: '0123456789abcdef0123456789abcdef' });
    handleFillFor(ctx, state);
    const [, , meta] = mockLogger.info.mock.calls[0]!;
    expect(meta.tokenId).toBe('0123456789ab');
  });
});

describe('handleExpiredFor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the poll timer and deletes the active order', () => {
    const ctx = makeCtx();
    ctx.pollTimers.set('ord-x', {} as NodeJS.Timeout);
    ctx.activeOrders.set('ord-x', makeState({ status: 'expired' }));
    handleExpiredFor(ctx, 'ord-x');
    expect(ctx.pollTimers.has('ord-x')).toBe(false);
    expect(ctx.activeOrders.has('ord-x')).toBe(false);
  });

  it('marks the state expired and emits an expired event when it exists', () => {
    const ctx = makeCtx();
    const state = makeState({ status: 'pending' });
    ctx.activeOrders.set('ord-y', state);
    handleExpiredFor(ctx, 'ord-y');
    expect(state.status).toBe('expired');
    expect(ctx.emit).toHaveBeenCalledWith('expired', 'ord-y');
  });

  it('does not emit when the order is not tracked', () => {
    const ctx = makeCtx();
    handleExpiredFor(ctx, 'missing');
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('best-effort cancels on the CLOB adapter and swallows errors', async () => {
    const ctx = makeCtx();
    ctx.activeOrders.set('ord-z', makeState());
    const cancelOrder = vi.fn().mockRejectedValue(new Error('network'));
    (ctx.adapter as unknown as AdapterStub).cancelOrder = cancelOrder;
    handleExpiredFor(ctx, 'ord-z');
    expect(cancelOrder).toHaveBeenCalledWith('ord-z');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Order ord-z expired',
      'LiveOrderManager',
    );
  });

  it('logs the expiry', () => {
    const ctx = makeCtx();
    ctx.activeOrders.set('ord-z', makeState());
    handleExpiredFor(ctx, 'ord-z');
    expect(mockLogger.info).toHaveBeenCalledWith('Order ord-z expired', 'LiveOrderManager');
  });
});

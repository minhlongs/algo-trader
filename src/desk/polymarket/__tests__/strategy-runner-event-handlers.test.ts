/**
 * Tests for Strategy Runner Event Handlers
 *
 * Covers handlePriceUpdate (status gate, debounce, token relevance,
 * execution, max-ticks auto-stop, success/error paths) and
 * createEventBusSubscription (subscribe/unsubscribe/handler).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockStrategy } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockStrategy: { execute: vi.fn() },
}));

vi.mock('@shared/utils/logger', () => ({ logger: mockLogger }));

import { handlePriceUpdate, createEventBusSubscription } from '../strategy-runner-event-handlers';
import type { EventHandlerContext } from '../strategy-runner-event-handlers';

function makeCtx(overrides: Partial<EventHandlerContext> = {}): EventHandlerContext {
  return {
    status: 'running',
    strategy: mockStrategy as any,
    config: { maxTicks: 0, minExecutionIntervalMs: 50 } as any,
    strategyName: 'test-strategy',
    executionCount: 0,
    lastExecutionTime: 0,
    trackedTokens: { has: () => false, size: 0 },
    updateLastExecutionTime: vi.fn(),
    incrementExecutionCount: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePayload(overrides: Partial<{ tokenId: string; bid: number; ask: number; timestamp: number }> = {}) {
  return {
    tokenId: 'yes-token',
    bid: 0.5,
    ask: 0.51,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('handlePriceUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when status is not running', async () => {
    const ctx = makeCtx({ status: 'stopped' });
    await handlePriceUpdate(ctx, makePayload());
    expect(ctx.updateLastExecutionTime).not.toHaveBeenCalled();
    expect(ctx.incrementExecutionCount).not.toHaveBeenCalled();
    expect(mockStrategy.execute).not.toHaveBeenCalled();
  });

  it('returns early when strategy is null', async () => {
    const ctx = makeCtx({ strategy: null });
    await handlePriceUpdate(ctx, makePayload());
    expect(ctx.incrementExecutionCount).not.toHaveBeenCalled();
  });

  it('returns early when debounced (too soon after last execution)', async () => {
    const ctx = makeCtx({
      lastExecutionTime: Date.now(),
      config: { maxTicks: 0, minExecutionIntervalMs: 60_000 } as any,
    });
    await handlePriceUpdate(ctx, makePayload());
    expect(ctx.updateLastExecutionTime).not.toHaveBeenCalled();
    expect(ctx.incrementExecutionCount).not.toHaveBeenCalled();
  });

  it('returns early when token is not tracked and trackedTokens is non-empty', async () => {
    const ctx = makeCtx({
      lastExecutionTime: 0,
      trackedTokens: { has: () => false, size: 1 },
    });
    await handlePriceUpdate(ctx, makePayload({ tokenId: 'other-token' }));
    expect(ctx.updateLastExecutionTime).not.toHaveBeenCalled();
    expect(ctx.incrementExecutionCount).not.toHaveBeenCalled();
  });

  it('executes when trackedTokens is empty (all tokens relevant)', async () => {
    const ctx = makeCtx({ lastExecutionTime: 0 });
    await handlePriceUpdate(ctx, makePayload());
    expect(ctx.updateLastExecutionTime).toHaveBeenCalled();
    expect(ctx.incrementExecutionCount).toHaveBeenCalled();
    expect(mockStrategy.execute).toHaveBeenCalled();
  });

  it('executes when token is tracked', async () => {
    const ctx = makeCtx({
      lastExecutionTime: 0,
      trackedTokens: { has: (t: string) => t === 'yes-token', size: 1 },
    });
    await handlePriceUpdate(ctx, makePayload({ tokenId: 'yes-token' }));
    expect(ctx.incrementExecutionCount).toHaveBeenCalled();
    expect(mockStrategy.execute).toHaveBeenCalled();
  });

  it('auto-stops when maxTicks reached', async () => {
    const ctx = makeCtx({
      lastExecutionTime: 0,
      executionCount: 5,
      config: { maxTicks: 5, minExecutionIntervalMs: 50 } as any,
    });
    await handlePriceUpdate(ctx, makePayload());
    expect(ctx.incrementExecutionCount).toHaveBeenCalled();
    expect(mockStrategy.execute).toHaveBeenCalled();
    expect(ctx.stop).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Max ticks reached, auto-stopping',
      'StrategyRunner',
      expect.any(Object),
    );
  });

  it('logs debug on successful execution without maxTicks', async () => {
    const ctx = makeCtx({ lastExecutionTime: 0 });
    await handlePriceUpdate(ctx, makePayload({ tokenId: 'tok-1', bid: 0.45, ask: 0.46 }));
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Reactive execution complete',
      'StrategyRunner',
      expect.objectContaining({
        strategy: 'test-strategy',
        triggerToken: 'tok-1',
        triggerBid: 0.45,
        triggerAsk: 0.46,
      }),
    );
  });

  it('catches and logs execution errors', async () => {
    const ctx = makeCtx({ lastExecutionTime: 0 });
    mockStrategy.execute.mockRejectedValueOnce(new Error('boom'));
    await handlePriceUpdate(ctx, makePayload());
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Reactive execution error',
      'StrategyRunner',
      expect.objectContaining({ err: 'Error: boom' }),
    );
  });
});

describe('createEventBusSubscription', () => {
  it('returns subscribe/unsubscribe/handler', () => {
    const on = vi.fn();
    const off = vi.fn();
    const eventBus = { on, off } as any;
    const ctx = makeCtx();
    const sub = createEventBusSubscription(eventBus, ctx);
    expect(typeof sub.subscribe).toBe('function');
    expect(typeof sub.unsubscribe).toBe('function');
    expect(typeof sub.handler).toBe('function');
  });

  it('subscribe registers handler on PRICE_UPDATE', () => {
    const on = vi.fn();
    const off = vi.fn();
    const eventBus = { on, off } as any;
    const sub = createEventBusSubscription(eventBus, makeCtx());
    sub.subscribe();
    expect(on).toHaveBeenCalledWith('PRICE_UPDATE', sub.handler);
  });

  it('unsubscribe removes handler from PRICE_UPDATE', () => {
    const on = vi.fn();
    const off = vi.fn();
    const eventBus = { on, off } as any;
    const sub = createEventBusSubscription(eventBus, makeCtx());
    sub.unsubscribe();
    expect(off).toHaveBeenCalledWith('PRICE_UPDATE', sub.handler);
  });

  it('handler delegates to handlePriceUpdate', async () => {
    const on = vi.fn();
    const off = vi.fn();
    const eventBus = { on, off } as any;
    const ctx = makeCtx({ lastExecutionTime: 0 });
    const sub = createEventBusSubscription(eventBus, ctx);
    const payload = makePayload();
    await sub.handler(payload);
    expect(ctx.incrementExecutionCount).toHaveBeenCalled();
    expect(mockStrategy.execute).toHaveBeenCalled();
  });
});
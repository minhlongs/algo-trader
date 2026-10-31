/**
 * Correctness tests for the Polymarket trade lifecycle.
 *
 * These tests encode invariants that the previous implementation violated:
 *
 * 1. Exiting a NO position must SELL the NO token, not buy more of it.
 *    YES and NO are distinct ERC-1155 tokens, so an entry is always a BUY of
 *    whichever token was targeted and an exit is always a SELL of that token.
 * 2. Exit size must be the token quantity actually acquired at entry, not a
 *    quantity derived from the current exit price.
 * 3. A position is only recorded, and a trade event only emitted, once the
 *    order has actually filled. A resting GTC order is not a fill.
 * 4. A failed or unfilled exit must not remove the position from tracking.
 */

import { describe, it, expect, vi } from 'vitest';
import { performEntry, performExit, type TradeLifecycleContext } from '../base-polymarket-strategy-trades';
import type { OpenPosition, StrategyDeps, TradeEvent } from '../base-polymarket-strategy-types';

function makeCtx(overrides: Partial<TradeLifecycleContext> = {}, depsOverrides: Partial<StrategyDeps> = {}) {
  const trades: TradeEvent[] = [];
  const positions: OpenPosition[] = [];
  const cooldowns: string[] = [];

  let orderCall = 0;
  const orderManager = {
    // Default fixture mocks a venue that confirms every fill.
    placeOrder: vi.fn(async () => ({ id: `order-${++orderCall}`, filled: true })),
    cancelOrder: vi.fn(async () => {}),
    cancelAllOrders: vi.fn(async () => {}),
    getOpenOrders: vi.fn(async () => []),
  };

  const ctx: TradeLifecycleContext = {
    deps: { orderManager, ...depsOverrides } as unknown as StrategyDeps,
    positions,
    strategyName: 'polymarket-arb',
    emitTrade: (t) => trades.push(t),
    setCooldown: (id) => cooldowns.push(id),
    ...overrides,
  };

  return { ctx, positions, trades, cooldowns, orderManager };
}

describe('performEntry', () => {
  it('does not record a position when the venue returns an unfilled GTC order', async () => {
    const { ctx, positions, orderManager } = makeCtx();
    // Override the default filled mock with one that returns unfilled (resting GTC).
    orderManager.placeOrder = vi.fn(async () => ({
      id: 'order-gct-1',
      filled: false,
    })) as unknown as typeof orderManager.placeOrder;

    await expect(
      performEntry(ctx, 'no-token-1', 'cond-1', 'no', 0.45, 90),
    ).rejects.toThrow();

    // The venue order is placed on the token the caller named.
    expect(orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = orderManager.placeOrder.mock.calls[0][0];
    expect(call.tokenId).toBe('no-token-1');
    expect(call.side).toBe('buy');

    // A resting GTC order is not a fill, so no position exists yet.
    expect(positions).toHaveLength(0);
  });

  it('records the token quantity bought so a later exit can sell exactly that', async () => {
    const { ctx, orderManager } = makeCtx();
    // The order is confirmed filled at 200 tokens for 90 USDC at 0.45.
    orderManager.placeOrder = vi.fn(async () => ({
      id: 'order-1',
      filled: true,
      filledSize: '200',
      fillPrice: '0.45',
    })) as unknown as typeof orderManager.placeOrder;

    await performEntry(ctx, 'no-token-1', 'cond-1', 'no', 0.45, 90);

    // The recorded token quantity is round(90 / 0.45) = 200, not the USDC notional.
    const recorded = ctx.positions[0] as unknown as { tokenQuantity?: number };
    expect(recorded.tokenQuantity).toBe(200);
  });
});

describe('performExit', () => {
  it('sells the NO token when closing a NO position (never buys more of it)', async () => {
    const { ctx, positions, orderManager } = makeCtx();

    const pos: OpenPosition = {
      tokenId: 'no-token-1',
      conditionId: 'cond-1',
      side: 'no',
      entryPrice: 0.45,
      sizeUsdc: 90,
      tokenQuantity: 200,
      orderId: 'order-1',
      openedAt: Date.now(),
    };
    positions.push(pos);

    await performExit(ctx, pos, 0.35, 'take-profit');

    // Closing a NO position must SELL, because entry bought the NO token.
    const call = orderManager.placeOrder.mock.calls[0][0];
    expect(call.side).toBe('sell');
    expect(call.tokenId).toBe('no-token-1');
  });

  it('sells the token quantity acquired at entry, not a current-price quantity', async () => {
    const { ctx, positions, orderManager } = makeCtx();

    const pos: OpenPosition = {
      tokenId: 'no-token-1',
      conditionId: 'cond-1',
      side: 'no',
      entryPrice: 0.45,
      sizeUsdc: 90,
      tokenQuantity: 200,
      orderId: 'order-1',
      openedAt: Date.now(),
    };
    positions.push(pos);

    // Exit at 0.35. Old math sold round(90 / 0.35) = 257 tokens.
    // Correct math sells the 200 tokens actually bought at entry.
    await performExit(ctx, pos, 0.35, 'take-profit');

    const call = orderManager.placeOrder.mock.calls[0][0];
    expect(call.size).toBe('200');
  });

  it('re-throws when the exit order fails, so the caller can keep the position', async () => {
    const orderManager = {
      placeOrder: vi.fn(async () => { throw new Error('venue rejected'); }),
      cancelOrder: vi.fn(async () => {}),
      cancelAllOrders: vi.fn(async () => {}),
      getOpenOrders: vi.fn(async () => []),
    };
    const { ctx, positions } = makeCtx({}, { orderManager } as unknown as Partial<StrategyDeps>);

    const pos: OpenPosition = {
      tokenId: 'no-token-1',
      conditionId: 'cond-1',
      side: 'no',
      entryPrice: 0.45,
      sizeUsdc: 90,
      tokenQuantity: 200,
      orderId: 'order-1',
      openedAt: Date.now(),
    };
    positions.push(pos);

    // The position must stay tracked; the failure must be observable.
    await expect(performExit(ctx, pos, 0.35, 'take-profit')).rejects.toThrow(/venue rejected/);
    expect(positions).toHaveLength(1);
  });

  it('does not emit a trade event before the exit order fills', async () => {
    const orderManager = {
      placeOrder: vi.fn(async () => { throw new Error('venue rejected'); }),
      cancelOrder: vi.fn(async () => {}),
      cancelAllOrders: vi.fn(async () => {}),
      getOpenOrders: vi.fn(async () => []),
    };
    const { ctx, positions, trades, cooldowns } = makeCtx({}, { orderManager } as unknown as Partial<StrategyDeps>);

    const pos: OpenPosition = {
      tokenId: 'no-token-1',
      conditionId: 'cond-1',
      side: 'no',
      entryPrice: 0.45,
      sizeUsdc: 90,
      tokenQuantity: 200,
      orderId: 'order-1',
      openedAt: Date.now(),
    };
    positions.push(pos);

    await expect(performExit(ctx, pos, 0.35, 'take-profit')).rejects.toThrow();

    // No fabricated exit fill, and no cooldown chalking off an unfilled exit.
    expect(trades).toHaveLength(0);
    expect(cooldowns).toHaveLength(0);
  });
});

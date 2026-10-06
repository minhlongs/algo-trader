/**
 * Polymarket Order Executor Unit Tests
 * Validates bounded limit pricing, slippage bounding, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePolymarketOrder } from '../../../../src/desk/execution/polymarket-order-executor';
import { OrderPlacementError } from '../../../../src/desk/arbitrage/connectors/types';
import { PolymarketTerminalCache } from '../../../../src/desk/execution/polymarket-terminal-cache';
import type { PolymarketAdapter } from '../../../../src/desk/execution/polymarket-adapter';

describe('polymarket-order-executor', () => {
  let cache: PolymarketTerminalCache;

  beforeEach(() => {
    cache = new PolymarketTerminalCache();
  });

  const createMockAdapter = (overrides: Partial<PolymarketAdapter> = {}): PolymarketAdapter => {
    return {
      placeOrder: vi.fn().mockResolvedValue({ orderID: '0xmock-1', status: 'matched' }),
      cancelOrder: vi.fn().mockResolvedValue({ canceled: true }),
      getOpenOrders: vi.fn().mockResolvedValue([]),
      getOrderBook: vi.fn().mockResolvedValue({
        market: 'mock-market',
        asset_id: 'tok-abc',
        bids: [{ price: '0.48', size: '1000' }],
        asks: [{ price: '0.52', size: '1000' }],
        hash: '0xhash',
        timestamp: String(Date.now()),
      }),
      getMarketInfo: vi.fn().mockResolvedValue({
        condition_id: '0xcond',
        question: 'Will X happen?',
        tokens: [],
      }),
      ...overrides,
    };
  };

  it('bounds buy market orders with default maxSlippageBps (500 bps = 5%)', async () => {
    const adapter = createMockAdapter();
    const result = await executePolymarketOrder(
      {
        symbol: 'tok-abc',
        side: 'buy',
        type: 'market',
        amount: 100,
      },
      adapter,
      { dryRun: true },
      cache
    );

    // ask = 0.52, 0.52 * 1.05 = 0.546
    expect(result.price).toBe(0.546);
    expect(adapter.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 0.546,
        side: 'BUY',
        size: 100,
      })
    );
  });

  it('bounds sell market orders with default maxSlippageBps (500 bps = 5%)', async () => {
    const adapter = createMockAdapter();
    const result = await executePolymarketOrder(
      {
        symbol: 'tok-abc',
        side: 'sell',
        type: 'market',
        amount: 50,
      },
      adapter,
      { dryRun: true },
      cache
    );

    // bid = 0.48, 0.48 * (1 - 0.05) = 0.456
    expect(result.price).toBe(0.456);
    expect(adapter.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 0.456,
        side: 'SELL',
        size: 50,
      })
    );
  });

  it('respects custom maxSlippageBps in options', async () => {
    const adapter = createMockAdapter();
    const result = await executePolymarketOrder(
      {
        symbol: 'tok-abc',
        side: 'buy',
        type: 'market',
        amount: 100,
      },
      adapter,
      { dryRun: true, maxSlippageBps: 200 }, // 2%
      cache
    );

    // ask = 0.52, 0.52 * 1.02 = 0.5304
    expect(result.price).toBe(0.5304);
  });

  it('throws OrderPlacementError when reference price is unavailable', async () => {
    const adapter = createMockAdapter({
      getOrderBook: vi.fn().mockResolvedValue({
        market: 'mock-market',
        asset_id: 'tok-empty',
        bids: [],
        asks: [],
        hash: '0xhash',
        timestamp: String(Date.now()),
      }),
    });

    await expect(
      executePolymarketOrder(
        {
          symbol: 'tok-empty',
          side: 'buy',
          type: 'market',
          amount: 100,
        },
        adapter,
        { dryRun: true },
        cache
      )
    ).rejects.toThrow(OrderPlacementError);
  });

  it('throws OrderPlacementError when getOrderBook rejects', async () => {
    const adapter = createMockAdapter({
      getOrderBook: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    await expect(
      executePolymarketOrder(
        {
          symbol: 'tok-err',
          side: 'buy',
          type: 'market',
          amount: 100,
        },
        adapter,
        { dryRun: true },
        cache
      )
    ).rejects.toThrow(OrderPlacementError);
  });

  it('preserves explicit limit price without orderbook lookup', async () => {
    const adapter = createMockAdapter();
    const result = await executePolymarketOrder(
      {
        symbol: 'tok-abc',
        side: 'buy',
        type: 'limit',
        amount: 25,
        price: 0.42,
      },
      adapter,
      { dryRun: true },
      cache
    );

    expect(result.price).toBe(0.42);
    expect(adapter.getOrderBook).not.toHaveBeenCalled();
  });
});

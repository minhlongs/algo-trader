/**
 * CexOrderExecutor unit tests — BinanceSpotClient injected as mock.
 * Tests signal routing, dry-run mode, perp gate, and error propagation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetExecutionModeCache } from '../../src/desk/execution/execution-mode';
import { CexOrderExecutor } from '../../src/desk/execution/cex-order-executor';
import type { BinanceSpotClient } from '../../src/desk/markets/cex/binance-spot-client';
import type { CexOrderResponse } from '../../src/desk/markets/cex/cex-types';
import type { ISignal } from '../../src/desk/interfaces/IStrategy';

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock('../../src/desk/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignal(action: 'buy' | 'sell' | 'wait', confidence = 0.8): ISignal {
  return { action, confidence, reason: `test-${action}` };
}

function makeOrderResponse(overrides: Partial<CexOrderResponse> = {}): CexOrderResponse {
  return {
    id: 'order-abc',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'market',
    amount: 100,
    price: undefined,
    status: 'closed',
    timestamp: 1700000000000,
    ...overrides,
  };
}

function makeMockClient(): BinanceSpotClient {
  return {
    placeOrder: vi.fn(),
    getName: vi.fn().mockReturnValue('binance-spot'),
    getCandles: vi.fn(),
    getOrderBook: vi.fn(),
    getBalances: vi.fn(),
  } as unknown as BinanceSpotClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CexOrderExecutor', () => {
  let mockClient: BinanceSpotClient;
  const baseConfig = { symbol: 'BTC/USDT', orderSizeUsdt: 100 };

  beforeEach(() => {
    // These tests exercise the live order-placement path directly, so they
    // opt into LIVE mode explicitly. Production code never sets this — it is
    // an operator env var gated by a literal-string comparison.
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    vi.clearAllMocks();
    mockClient = makeMockClient();
  });

  // ── wait signal ─────────────────────────────────────────────────────────────

  it('returns null and does not place order for wait signal', async () => {
    const executor = new CexOrderExecutor(baseConfig, mockClient);
    const result = await executor.execute(makeSignal('wait'));

    expect(result).toBeNull();
    expect(mockClient.placeOrder).not.toHaveBeenCalled();
  });

  // ── buy signal ──────────────────────────────────────────────────────────────

  it('places market buy order for buy signal', async () => {
    vi.mocked(mockClient.placeOrder).mockResolvedValueOnce(makeOrderResponse({ side: 'buy' }));
    const executor = new CexOrderExecutor(baseConfig, mockClient);

    const result = await executor.execute(makeSignal('buy'));

    expect(mockClient.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 100,
    });
    expect(result?.id).toBe('order-abc');
    expect(result?.status).toBe('closed');
  });

  // ── sell signal ─────────────────────────────────────────────────────────────

  it('places market sell order for sell signal', async () => {
    vi.mocked(mockClient.placeOrder).mockResolvedValueOnce(
      makeOrderResponse({ side: 'sell', status: 'closed' }),
    );
    const executor = new CexOrderExecutor(baseConfig, mockClient);

    const result = await executor.execute(makeSignal('sell'));

    expect(mockClient.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'sell' }),
    );
    expect(result?.side).toBe('sell');
  });

  // ── dry-run mode ────────────────────────────────────────────────────────────

  it('dry-run returns synthetic response without calling placeOrder', async () => {
    const executor = new CexOrderExecutor({ ...baseConfig, dryRun: true }, mockClient);

    const result = await executor.execute(makeSignal('buy'));

    expect(mockClient.placeOrder).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.status).toBe('dry-run');
    expect(result?.id).toMatch(/^dry-run-/);
    expect(result?.symbol).toBe('BTC/USDT');
    expect(result?.side).toBe('buy');
  });

  it('dry-run with sell signal returns correct side', async () => {
    const executor = new CexOrderExecutor({ ...baseConfig, dryRun: true }, mockClient);
    const result = await executor.execute(makeSignal('sell'));
    expect(result?.side).toBe('sell');
    expect(result?.status).toBe('dry-run');
  });

  it('dry-run with wait signal still returns null', async () => {
    const executor = new CexOrderExecutor({ ...baseConfig, dryRun: true }, mockClient);
    const result = await executor.execute(makeSignal('wait'));
    expect(result).toBeNull();
    expect(mockClient.placeOrder).not.toHaveBeenCalled();
  });

  // ── error propagation ───────────────────────────────────────────────────────

  it('propagates exchange error from placeOrder', async () => {
    vi.mocked(mockClient.placeOrder).mockRejectedValueOnce(new Error('Insufficient funds'));
    const executor = new CexOrderExecutor(baseConfig, mockClient);

    await expect(executor.execute(makeSignal('buy'))).rejects.toThrow('Insufficient funds');
  });

  // ── getName ─────────────────────────────────────────────────────────────────

  it('getName returns cex-executor prefixed with client name', () => {
    const executor = new CexOrderExecutor(baseConfig, mockClient);
    expect(executor.getName()).toBe('cex-executor:binance-spot');
  });
});

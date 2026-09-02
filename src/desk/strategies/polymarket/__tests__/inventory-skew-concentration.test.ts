/**
 * inventory-skew-concentration — Unit Tests
 *
 * Tests runConcentrationCheck which trims over-concentrated positions
 * using OrderManager and emits events via EventBus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runConcentrationCheck } from '../inventory-skew-concentration';
import type { ConcentrationContext } from '../inventory-skew-concentration';
import type { OrderManager, EventBus } from '../../polymarket/order-manager';
import type { TrackedPosition, InventorySkewRebalancerConfig } from '../inventory-skew-types';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

function makeOrderManager(): OrderManager {
  return {
    placeOrder: vi.fn(async () => ({ id: 'order-123' })),
    cancelOrder: vi.fn(async () => {}),
    cancelAllOrders: vi.fn(async () => {}),
    getOpenOrders: vi.fn(async () => []),
  };
}

function makeEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  } as unknown as EventBus;
}

function makeConfig(overrides: Partial<InventorySkewRebalancerConfig> = {}): InventorySkewRebalancerConfig {
  return {
    skewThreshold: 0.3,
    maxConcentrationPct: 0.4,
    trimPct: 0.25,
    minPnlToTrim: 0.01,
    rebalanceIntervalMs: 60_000,
    maxTradesPerRebalance: 3,
    positionSize: '10',
    ...overrides,
  };
}

function makePosition(overrides: Partial<TrackedPosition> = {}): TrackedPosition {
  return {
    tokenId: 'BTC',
    side: 'yes',
    size: 100,
    entryPrice: 0.4,
    currentPrice: 0.5,
    marketId: 'm1',
    ...overrides,
  };
}

describe('runConcentrationCheck', () => {
  let orderManager: OrderManager;
  let eventBus: EventBus;
  let config: InventorySkewRebalancerConfig;
  let now: number;

  beforeEach(() => {
    vi.clearAllMocks();
    orderManager = makeOrderManager();
    eventBus = makeEventBus();
    config = makeConfig();
    now = Date.now();
  });

  const makeCtx = (positions: TrackedPosition[], cfg = config): ConcentrationContext => ({
    positions,
    cfg,
    orderManager,
    eventBus,
    now,
  });

  it('does nothing when no positions exceed concentration threshold', async () => {
    // Use 4 positions: 30, 30, 20, 20 (all * 0.5 = 15, 15, 10, 10)
    // total = 50, concentrations = 30%, 30%, 20%, 20% - all < 40%
    const pos1 = makePosition({ size: 30, currentPrice: 0.5 });
    const pos2 = makePosition({ size: 30, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });
    const pos3 = makePosition({ side: 'no', size: 20, currentPrice: 0.5, tokenId: 'SOL', marketId: 'm3' });
    const pos4 = makePosition({ side: 'no', size: 20, currentPrice: 0.5, tokenId: 'AVAX', marketId: 'm4' });
    await runConcentrationCheck(makeCtx([pos1, pos2, pos3, pos4]));

    expect(orderManager.placeOrder).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('trims position when concentration exceeds maxConcentrationPct and pnl > minPnlToTrim', async () => {
    // pos1 = 100*0.5 = 50, pos2 = 10*0.5 = 5 -> total = 55, pos1 concentration = 50/55 = 90.9% > 40%
    const pos1 = makePosition({ size: 100, currentPrice: 0.5 });
    const pos2 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });

    await runConcentrationCheck(makeCtx([pos1, pos2]));

    expect(orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(orderManager.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
      tokenId: 'BTC',
      side: 'sell',
      orderType: 'IOC',
    }));

    expect(eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({
        marketId: 'm1',
        side: 'sell',
        strategy: 'inventory-skew-rebalancer',
      }),
    }));

    expect(mockLogger.info).toHaveBeenCalledWith('Trimmed concentrated position', 'inventory-skew-rebalancer', expect.objectContaining({
      tokenId: 'BTC',
      trimSize: 25, // 100 * 0.25
    }));
  });

  it('skips trim when pnl < minPnlToTrim', async () => {
    // Same concentration as above but pnl = 0 (currentPrice = entryPrice)
    const pos1 = makePosition({ size: 100, currentPrice: 0.5, entryPrice: 0.5 });
    const pos2 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });

    await runConcentrationCheck(makeCtx([pos1, pos2]));

    expect(orderManager.placeOrder).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('skips trim when trimSize <= 0', async () => {
    // pos1 has size=0 (trimSize=0), pos2 has small size but also low concentration
    // Use pos2 with size=1 (exposure=0.5) and add another position to keep pos2 under 40%
    // pos1=0, pos2=1, pos3=100 -> total=50.5, pos1=0%, pos2=1%, pos3=99% - pos3 would trigger!
    // Better: pos1=0, pos2=10, pos3=10, pos4=10 -> total=15, pos1=0%, pos2=33%, pos3=33%, pos4=33%
    const pos1 = makePosition({ size: 0, currentPrice: 0.5, entryPrice: 0.4 });
    const pos2 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });
    const pos3 = makePosition({ size: 10, currentPrice: 0.5, tokenId: 'SOL', marketId: 'm3' });
    const pos4 = makePosition({ size: 10, currentPrice: 0.5, tokenId: 'AVAX', marketId: 'm4' });

    await runConcentrationCheck(makeCtx([pos1, pos2, pos3, pos4]));

    expect(orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('stops after maxTradesPerRebalance', async () => {
    // Use config with maxTradesPerRebalance = 2 and three positions over 40%
    // Need pos1, pos2, pos3 all > 40%, pos4 < 40%
    // pos1=60*0.5=30, pos2=60*0.5=30, pos3=60*0.5=30, pos4=10*0.5=5
    // total = 95, pos1=31.6%, pos2=31.6%, pos3=31.6%, pos4=5.3% - all under!
    // Need: pos1=80*0.5=40, pos2=80*0.5=40, pos3=80*0.5=40, pos4=10*0.5=5
    // total = 125, pos1=32%, pos2=32%, pos3=32% - still under
    // Use fewer small positions: pos1=80, pos2=80, pos3=10 -> total=85, pos1=47%, pos2=47%, pos3=6%
    const smallConfig = makeConfig({ maxTradesPerRebalance: 2 });
    const positions = [
      makePosition({ size: 80, currentPrice: 0.5, entryPrice: 0.4, tokenId: 'BTC', marketId: 'm1' }),
      makePosition({ size: 80, currentPrice: 0.5, entryPrice: 0.4, tokenId: 'ETH', marketId: 'm2' }),
      makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'SOL', marketId: 'm3' }),
    ];

    await runConcentrationCheck(makeCtx(positions, smallConfig));

    expect(orderManager.placeOrder).toHaveBeenCalledTimes(2); // maxTradesPerRebalance = 2
  });

  it('continues to next position on placeOrder failure', async () => {
    const failingOrderManager = makeOrderManager();
    failingOrderManager.placeOrder = vi.fn(async () => {
      throw new Error('order failed');
    });

    // Two positions over 40%, one under
    // pos1=60*0.5=30, pos2=60*0.5=30, pos3=10*0.5=5 -> total=65, pos1=46%, pos2=46%, pos3=7.7%
    const pos1 = makePosition({ size: 60, currentPrice: 0.5, tokenId: 'BTC', marketId: 'm1', entryPrice: 0.4 });
    const pos2 = makePosition({ size: 60, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2', entryPrice: 0.4 });
    const pos3 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'SOL', marketId: 'm3', entryPrice: 0.4 });

    await runConcentrationCheckWithCustomOrderManager(makeCtx([pos1, pos2, pos3], config), failingOrderManager);

    // Should have attempted both over-threshold positions (2) despite failures
    expect(failingOrderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('reduces position size after successful trim', async () => {
    const pos1 = makePosition({ size: 100, currentPrice: 0.5, entryPrice: 0.4 });
    const pos2 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });
    const ctx = makeCtx([pos1, pos2]);

    await runConcentrationCheck(ctx);

    // position should be mutated
    expect(pos1.size).toBe(75); // 100 - 25
  });

  it('uses price.toFixed(4) for order price', async () => {
    const pos1 = makePosition({ size: 100, currentPrice: 0.12345, entryPrice: 0.1 });
    const pos2 = makePosition({ side: 'no', size: 10, currentPrice: 0.5, tokenId: 'ETH', marketId: 'm2' });

    await runConcentrationCheck(makeCtx([pos1, pos2]));

    expect(orderManager.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
      price: '0.1235', // 0.12345.toFixed(4)
    }));
  });
});

// Helper to pass custom orderManager
async function runConcentrationCheckWithCustomOrderManager(ctx: ConcentrationContext, customOrderManager: OrderManager): Promise<void> {
  const { runConcentrationCheck: runCheck } = await import('../inventory-skew-concentration');
  return runCheck({ ...ctx, orderManager: customOrderManager });
}
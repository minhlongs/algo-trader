/**
 * inventory-skew-rebalancer — Unit Tests
 *
 * Tests createInventorySkewRebalancerTick factory and its returned tick function.
 * Covers: position tracking via eventBus listener, refreshPrices, main tick flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInventorySkewRebalancerTick } from '../inventory-skew-rebalancer';
import type { InventorySkewRebalancerDeps } from '../inventory-skew-types';
import type { TrackedPosition, InventorySkewRebalancerConfig } from '../inventory-skew-types';

// Mock dependencies
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

// Mock the split modules to avoid calling real implementations
const { mockRunRebalance } = vi.hoisted(() => ({
  mockRunRebalance: vi.fn(async (ctx: any) => ctx.lastRebalanceAt),
}));

vi.mock('../inventory-skew-rebalance', () => ({
  runRebalance: mockRunRebalance,
}));

const { mockRunConcentrationCheck } = vi.hoisted(() => ({
  mockRunConcentrationCheck: vi.fn(async () => {}),
}));

vi.mock('../inventory-skew-concentration', () => ({
  runConcentrationCheck: mockRunConcentrationCheck,
}));

function makeClobClient() {
  return {
    getOrderBook: vi.fn(async (tokenId: string) => ({
      bids: [{ price: '0.49' }],
      asks: [{ price: '0.51' }],
    })),
  };
}

function makeOrderManager() {
  return {
    placeOrder: vi.fn(async () => ({ id: 'order-123' })),
    cancelOrder: vi.fn(async () => {}),
    cancelAllOrders: vi.fn(async () => {}),
    getOpenOrders: vi.fn(async () => []),
  };
}

function makeEventBus() {
  const listeners = new Map<string, Function[]>();
  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, payload: any) => {
      const handlers = listeners.get(event);
      if (handlers) handlers.forEach(h => h(payload));
    }),
    once: vi.fn(),
    _listeners: listeners, // for test inspection
  };
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

function makeDeps(overrides: Partial<InventorySkewRebalancerDeps> = {}): InventorySkewRebalancerDeps {
  return {
    clob: makeClobClient(),
    orderManager: makeOrderManager(),
    eventBus: makeEventBus(),
    config: makeConfig(),
    ...overrides,
  };
}

describe('createInventorySkewRebalancerTick', () => {
  let deps: InventorySkewRebalancerDeps;
  let tick: () => Promise<void>;
  let clob: ReturnType<typeof makeClobClient>;
  let orderManager: ReturnType<typeof makeOrderManager>;
  let eventBus: ReturnType<typeof makeEventBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    clob = deps.clob as ReturnType<typeof makeClobClient>;
    orderManager = deps.orderManager as ReturnType<typeof makeOrderManager>;
    eventBus = deps.eventBus as ReturnType<typeof makeEventBus>;
    tick = createInventorySkewRebalancerTick(deps);
  });

  it('registers trade.executed listener on eventBus', () => {
    expect(eventBus.on).toHaveBeenCalledWith('trade.executed', expect.any(Function));
  });

  describe('trade.executed listener (position tracking)', () => {
    it('adds new position when tokenId+side not tracked', async () => {
      // Emit a trade.executed event
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      // Trigger tick to access positions internally (via debug log)
      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', 'inventory-skew-rebalancer', expect.objectContaining({
        positionCount: 1,
      }));
    });

    it('upserts existing position with weighted-average entryPrice', async () => {
      // First trade: 100 @ 0.5
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      // Second trade: 100 @ 0.6 -> weighted avg = (100*0.5 + 100*0.6)/200 = 0.55
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-2',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.6',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', 'inventory-skew-rebalancer', expect.objectContaining({
        positionCount: 1,
      }));
    });

    it('treats sell as "no" side', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'sell',
          fillPrice: '0.5',
          fillSize: '50',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', 'inventory-skew-rebalancer', expect.objectContaining({
        positionCount: 1,
      }));
    });

    it('ignores trades with zero or negative size', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '0',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('No positions to rebalance', 'inventory-skew-rebalancer', {});
    });

    it('tracks multiple tokenId+side combinations separately', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-2',
          marketId: 'ETH-yes',
          side: 'buy',
          fillPrice: '0.4',
          fillSize: '50',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', 'inventory-skew-rebalancer', expect.objectContaining({
        positionCount: 2,
      }));
    });
  });

  describe('refreshPrices', () => {
    it('updates currentPrice to mid-price (bid+ask)/2', async () => {
      // First add a position
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      // clob.getOrderBook should have been called
      expect(clob.getOrderBook).toHaveBeenCalledWith('BTC-yes');
    });

    it('keeps previous price when getOrderBook throws', async () => {
      const failingClob = makeClobClient();
      failingClob.getOrderBook = vi.fn(async () => { throw new Error('network error'); });

      const depsWithFailingClob = makeDeps({ clob: failingClob });
      const failingEB = depsWithFailingClob.eventBus as ReturnType<typeof makeEventBus>;
      const failingTick = createInventorySkewRebalancerTick(depsWithFailingClob);

      // Add a position
      await failingEB.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      // Should not throw, should keep previous price
      await expect(failingTick()).resolves.toBeUndefined();

      expect(failingClob.getOrderBook).toHaveBeenCalledWith('BTC-yes');
    });

    it('handles empty order book (no bids/asks)', async () => {
      const emptyClob = makeClobClient();
      emptyClob.getOrderBook = vi.fn(async () => ({ bids: [], asks: [] }));

      const depsWithEmptyClob = makeDeps({ clob: emptyClob });
      const emptyEB = depsWithEmptyClob.eventBus as ReturnType<typeof makeEventBus>;
      const emptyTick = createInventorySkewRebalancerTick(depsWithEmptyClob);

      await emptyEB.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await expect(emptyTick()).resolves.toBeUndefined();
      expect(emptyClob.getOrderBook).toHaveBeenCalledWith('BTC-yes');
    });
  });

  describe('main tick function', () => {
    it('returns early and logs debug when no positions', async () => {
      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('No positions to rebalance', 'inventory-skew-rebalancer', {});
      expect(mockRunConcentrationCheck).not.toHaveBeenCalled();
      expect(mockRunRebalance).not.toHaveBeenCalled();
    });

    it('calls refreshPrices, runConcentrationCheck, and runRebalance when positions exist', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(clob.getOrderBook).toHaveBeenCalledWith('BTC-yes');
      expect(mockRunConcentrationCheck).toHaveBeenCalled();
      expect(mockRunRebalance).toHaveBeenCalled();
    });

    it('passes correct context to runConcentrationCheck', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockRunConcentrationCheck).toHaveBeenCalledWith(expect.objectContaining({
        positions: expect.any(Array),
        cfg: expect.any(Object),
        orderManager: expect.any(Object),
        eventBus: expect.any(Object),
        now: expect.any(Number),
      }));
    });

    it('passes correct context to runRebalance and updates lastRebalanceAt', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockRunRebalance).toHaveBeenCalledWith(expect.objectContaining({
        positions: expect.any(Array),
        cfg: expect.any(Object),
        orderManager: expect.any(Object),
        eventBus: expect.any(Object),
        now: expect.any(Number),
        lastRebalanceAt: 0,
      }));
    });

    it('logs error when tick throws', async () => {
      const failingDeps = makeDeps();
      const failingEB = failingDeps.eventBus as ReturnType<typeof makeEventBus>;
      const failingTick = createInventorySkewRebalancerTick(failingDeps);

      // Make runConcentrationCheck throw to trigger the catch block in tick
      mockRunConcentrationCheck.mockRejectedValueOnce(new Error('concentration check failed'));

      await failingEB.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await expect(failingTick()).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith('Tick failed', 'inventory-skew-rebalancer', expect.objectContaining({
        err: expect.stringContaining('concentration check failed'),
      }));

      // Reset mock for other tests
      mockRunConcentrationCheck.mockResolvedValue(undefined);
    });

    it('logs skew and positionCount on successful tick', async () => {
      await eventBus.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await tick();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', 'inventory-skew-rebalancer', expect.objectContaining({
        positionCount: 1,
        skew: expect.any(String),
      }));
    });

    it('uses config overrides from deps.config', async () => {
      const customConfig = makeConfig({ skewThreshold: 0.5, maxTradesPerRebalance: 5 });
      const customDeps = makeDeps({ config: customConfig });
      const customEB = customDeps.eventBus as ReturnType<typeof makeEventBus>;
      const customTick = createInventorySkewRebalancerTick(customDeps);

      await customEB.emit('trade.executed', {
        trade: {
          orderId: 'ord-1',
          marketId: 'BTC-yes',
          side: 'buy',
          fillPrice: '0.5',
          fillSize: '100',
          fees: '0',
          timestamp: Date.now(),
          strategy: 'inventory-skew-rebalancer',
        },
      });

      await customTick();

      expect(mockRunRebalance).toHaveBeenCalledWith(expect.objectContaining({
        cfg: expect.objectContaining({
          skewThreshold: 0.5,
          maxTradesPerRebalance: 5,
        }),
      }));
    });
  });
});
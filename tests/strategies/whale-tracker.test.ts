import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcMedianSize,
  detectWhaleOrders,
  calcWhaleImbalance,
  shouldEnter,
  createWhaleTrackerTick,
  type WhaleTrackerConfig,
  type WhaleTrackerDeps,
  type WhaleEvent,
} from '../../src/desk/strategies/polymarket/whale-tracker.js';
import type { RawOrderBook } from '../../src/polymarket/clob-client.js';

// ── Helper: build a mock orderbook ──────────────────────────────────────────

function makeBook(bids: [string, string][], asks: [string, string][]): RawOrderBook {
  return {
    market: 'test-market',
    asset_id: 'test-token',
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    hash: 'abc',
  };
}

function makeConfig(overrides: Partial<WhaleTrackerConfig> = {}): WhaleTrackerConfig {
  return {
    whaleThreshold: 10,
    imbalanceRatio: 3.0,
    minWhaleEvents: 2,
    whaleWindowMs: 60_000,
    minWhaleVolume: 500,
    takeProfitPct: 0.04,
    stopLossPct: 0.025,
    maxHoldMs: 600_000,
    maxPositions: 3,
    cooldownMs: 120_000,
    positionSize: '15',
    ...overrides,
  };
}

// ── calcMedianSize tests ────────────────────────────────────────────────────

describe('calcMedianSize', () => {
  it('returns 0 for empty array', () => {
    expect(calcMedianSize([])).toBe(0);
  });

  it('returns the value for single element', () => {
    expect(calcMedianSize([{ size: '100' }])).toBe(100);
  });

  it('returns median for odd count', () => {
    // sorted: 10, 20, 30 → median = 20
    expect(calcMedianSize([{ size: '30' }, { size: '10' }, { size: '20' }])).toBe(20);
  });

  it('returns average of two middle values for even count', () => {
    // sorted: 10, 20, 30, 40 → median = (20+30)/2 = 25
    expect(calcMedianSize([{ size: '40' }, { size: '10' }, { size: '30' }, { size: '20' }])).toBe(25);
  });

  it('handles multiple identical values', () => {
    expect(calcMedianSize([{ size: '50' }, { size: '50' }, { size: '50' }])).toBe(50);
  });
});

// ── detectWhaleOrders tests ─────────────────────────────────────────────────

describe('detectWhaleOrders', () => {
  it('returns empty for empty book', () => {
    const book = makeBook([], []);
    expect(detectWhaleOrders(book, 10)).toEqual([]);
  });

  it('returns empty when no whale orders exist', () => {
    // All sizes are similar, none > median * 10
    const book = makeBook(
      [['0.50', '10'], ['0.49', '12'], ['0.48', '11']],
      [['0.51', '10'], ['0.52', '11'], ['0.53', '12']],
    );
    expect(detectWhaleOrders(book, 10)).toEqual([]);
  });

  it('detects bid-side whale orders', () => {
    // median of [10, 10, 10, 200] sorted = [10,10,10,200], median=(10+10)/2=10
    // 200 > 10*10=100 → whale
    const book = makeBook(
      [['0.50', '200'], ['0.49', '10']],
      [['0.51', '10'], ['0.52', '10']],
    );
    const whales = detectWhaleOrders(book, 10);
    expect(whales.length).toBe(1);
    expect(whales[0].side).toBe('bid');
    expect(whales[0].size).toBe(200);
  });

  it('detects ask-side whale orders', () => {
    const book = makeBook(
      [['0.50', '10'], ['0.49', '10']],
      [['0.51', '300'], ['0.52', '10']],
    );
    const whales = detectWhaleOrders(book, 10);
    expect(whales.length).toBe(1);
    expect(whales[0].side).toBe('ask');
    expect(whales[0].size).toBe(300);
  });

  it('detects mixed bid and ask whale orders', () => {
    // sizes: [2000, 5, 1500, 5] sorted = [5, 5, 1500, 2000] median=(5+1500)/2=752.5
    // cutoff = 752.5*3 = 2257.5 at threshold=3 → no whales
    // At threshold=2: cutoff = 752.5*2 = 1505 → 2000 qualifies, 1500 does not
    // Use smaller threshold: sorted=[5,5,1500,2000], median=752.5, threshold=1.5 → cutoff=1128.75
    // Both 1500 and 2000 > 1128.75 → 2 whales
    const book = makeBook(
      [['0.50', '2000'], ['0.49', '5']],
      [['0.51', '1500'], ['0.52', '5']],
    );
    const whales = detectWhaleOrders(book, 1.5);
    expect(whales.length).toBe(2);
    expect(whales.some(w => w.side === 'bid')).toBe(true);
    expect(whales.some(w => w.side === 'ask')).toBe(true);
  });

  it('respects threshold parameter', () => {
    // median of [10, 10, 50] = 10; 50 > 10*3=30 at threshold=3 → whale
    // but 50 < 10*10=100 at threshold=10 → not whale
    const book = makeBook(
      [['0.50', '50'], ['0.49', '10']],
      [['0.51', '10']],
    );
    expect(detectWhaleOrders(book, 3).length).toBe(1);
    expect(detectWhaleOrders(book, 10).length).toBe(0);
  });
});

// ── calcWhaleImbalance tests ────────────────────────────────────────────────

describe('calcWhaleImbalance', () => {
  it('returns zeros for empty events', () => {
    const result = calcWhaleImbalance([]);
    expect(result.bidVolume).toBe(0);
    expect(result.askVolume).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it('returns bid-heavy imbalance', () => {
    const events: WhaleEvent[] = [
      { timestamp: Date.now(), side: 'bid', price: 0.50, size: 600 },
      { timestamp: Date.now(), side: 'ask', price: 0.55, size: 100 },
    ];
    const result = calcWhaleImbalance(events);
    expect(result.bidVolume).toBe(600);
    expect(result.askVolume).toBe(100);
    expect(result.ratio).toBe(6);
  });

  it('returns ask-heavy imbalance', () => {
    const events: WhaleEvent[] = [
      { timestamp: Date.now(), side: 'bid', price: 0.50, size: 100 },
      { timestamp: Date.now(), side: 'ask', price: 0.55, size: 900 },
    ];
    const result = calcWhaleImbalance(events);
    expect(result.bidVolume).toBe(100);
    expect(result.askVolume).toBe(900);
    expect(result.ratio).toBeCloseTo(100 / 900);
  });

  it('returns balanced imbalance', () => {
    const events: WhaleEvent[] = [
      { timestamp: Date.now(), side: 'bid', price: 0.50, size: 500 },
      { timestamp: Date.now(), side: 'ask', price: 0.55, size: 500 },
    ];
    const result = calcWhaleImbalance(events);
    expect(result.ratio).toBe(1);
  });

  it('returns Infinity ratio when only bids exist', () => {
    const events: WhaleEvent[] = [
      { timestamp: Date.now(), side: 'bid', price: 0.50, size: 500 },
    ];
    const result = calcWhaleImbalance(events);
    expect(result.ratio).toBe(Infinity);
  });

  it('returns 0 ratio when only asks exist', () => {
    const events: WhaleEvent[] = [
      { timestamp: Date.now(), side: 'ask', price: 0.55, size: 500 },
    ];
    const result = calcWhaleImbalance(events);
    expect(result.ratio).toBe(0);
  });
});

// ── shouldEnter tests ───────────────────────────────────────────────────────

describe('shouldEnter', () => {
  const cfg = makeConfig();

  it('returns buy-yes when bid-heavy ratio exceeds threshold', () => {
    const imbalance = { ratio: 4.0, bidVolume: 800, askVolume: 200 };
    expect(shouldEnter(imbalance, cfg)).toBe('buy-yes');
  });

  it('returns buy-no when ask-heavy ratio exceeds threshold', () => {
    // ratio = 200/800 = 0.25, inverse = 4.0 >= 3.0
    const imbalance = { ratio: 0.25, bidVolume: 200, askVolume: 800 };
    expect(shouldEnter(imbalance, cfg)).toBe('buy-no');
  });

  it('returns null when ratio is below threshold', () => {
    const imbalance = { ratio: 1.5, bidVolume: 450, askVolume: 300 };
    expect(shouldEnter(imbalance, cfg)).toBeNull();
  });

  it('returns null when volume is below minimum', () => {
    const imbalance = { ratio: 5.0, bidVolume: 100, askVolume: 20 };
    expect(shouldEnter(imbalance, cfg)).toBeNull();
  });

  it('returns buy-no when only ask volume with sufficient total', () => {
    const imbalance = { ratio: 0, bidVolume: 0, askVolume: 600 };
    expect(shouldEnter(imbalance, cfg)).toBe('buy-no');
  });

  it('returns buy-yes with Infinity ratio and sufficient volume', () => {
    const imbalance = { ratio: Infinity, bidVolume: 600, askVolume: 0 };
    expect(shouldEnter(imbalance, cfg)).toBe('buy-yes');
  });
});

// ── Tick factory tests ──────────────────────────────────────────────────────

function makeDeps(overrides: Partial<WhaleTrackerDeps> = {}): WhaleTrackerDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook(
          [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
          [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
        ),
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([
        {
          id: 'm1', question: 'Test?', slug: 'test', conditionId: 'cond-1',
          yesTokenId: 'yes-1', noTokenId: 'no-1', yesPrice: 0.50, noPrice: 0.50,
          volume: 1000, volume24h: 500, liquidity: 5000, endDate: '2026-12-31',
          active: true, closed: false, resolved: false, outcome: null,
        },
      ]),
    } as any,
    ...overrides,
  };
}

describe('createWhaleTrackerTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function', () => {
    const tick = createWhaleTrackerTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders when no whale orders detected', async () => {
    // Default book has all equal sizes — no whales
    const deps = makeDeps();
    const tick = createWhaleTrackerTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API error')) } as any,
    });
    const tick = createWhaleTrackerTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
    });
    const tick = createWhaleTrackerTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
          closed: true, resolved: false, active: true,
        }]),
      } as any,
    });
    const tick = createWhaleTrackerTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
          closed: false, resolved: true, active: true,
        }]),
      } as any,
    });
    const tick = createWhaleTrackerTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('enters position on whale detection (buy-yes)', async () => {
    // Book with a whale bid: sizes [1000, 10, 10, 10, 10, 10]
    // median = 10, threshold = 5, cutoff = 50, 1000 > 50 → whale bid
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(whaleBook) } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        whaleWindowMs: 60_000,
      },
    });

    const tick = createWhaleTrackerTick(deps);

    // First tick: detects whale but only 1 event, need minWhaleEvents=2
    await tick();
    // Second tick: accumulates 2 whale events
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(call.side).toBe('buy');
    expect(call.tokenId).toBe('yes-1');
  });

  it('enters position on whale detection (buy-no)', async () => {
    // Book with a whale ask
    const whaleBook = makeBook(
      [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '1000'], ['0.53', '10'], ['0.54', '10']],
    );

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(whaleBook) } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        whaleWindowMs: 60_000,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick();
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(call.side).toBe('buy');
    expect(call.tokenId).toBe('no-1');
  });

  it('exits on take profit', async () => {
    // First: whale book for entry, then price moves up for TP
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(whaleBook);
        // After entry: price goes up from 0.50 mid to 0.60 mid (>4% gain)
        return Promise.resolve(makeBook(
          [['0.59', '10'], ['0.58', '10']],
          [['0.61', '10'], ['0.62', '10']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        takeProfitPct: 0.04,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick(); // first whale event
    await tick(); // entry

    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    // Next tick: check exits — price up significantly → take profit
    await tick();

    // Should have placed an exit order (2 total calls)
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    const exitCall = (deps.orderManager.placeOrder as any).mock.calls[1][0];
    expect(exitCall.side).toBe('sell'); // exit a YES position
    expect(exitCall.orderType).toBe('IOC');
  });

  it('exits on stop loss', async () => {
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(whaleBook);
        // Price drops significantly → stop loss
        return Promise.resolve(makeBook(
          [['0.44', '10'], ['0.43', '10']],
          [['0.46', '10'], ['0.47', '10']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        stopLossPct: 0.025,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick();
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    await tick();
    // Exit order placed
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('exits on max hold time', async () => {
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(whaleBook) } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        maxHoldMs: 1, // 1ms to trigger immediately
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick();
    await tick(); // entry
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    // Wait a tiny bit to exceed maxHoldMs
    await new Promise(r => setTimeout(r, 5));
    await tick(); // exit
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('exits on whale reversal', async () => {
    const bidWhaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    // After entry, ask whales appear (reversal)
    const askWhaleBook = makeBook(
      [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '1000'], ['0.53', '1000'], ['0.54', '10']],
    );

    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(bidWhaleBook);
        // Reversal: ask whales appear
        return Promise.resolve(askWhaleBook);
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        whaleWindowMs: 60_000,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick(); // first whale
    await tick(); // entry
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    // Multiple ticks to accumulate enough ask whale events for reversal
    await tick();
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('cooldown prevents re-entry', async () => {
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(whaleBook);
        if (callCount === 3) {
          // Price up for TP exit
          return Promise.resolve(makeBook(
            [['0.59', '10']], [['0.61', '10']],
          ));
        }
        // Back to whale book after exit
        return Promise.resolve(whaleBook);
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        takeProfitPct: 0.04,
        cooldownMs: 120_000, // 2 min cooldown
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick(); // whale event 1
    await tick(); // entry
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    await tick(); // TP exit
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);

    // Try to re-enter — should be on cooldown
    await tick();
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2); // no new orders
  });

  it('respects maxPositions limit', async () => {
    // Use a book where mid ~ ask to avoid stop-loss on the exit check.
    // bid=0.51, ask=0.52, mid=0.515. Entry at 0.52, gain=(0.515-0.52)/0.52=-0.96% < 2.5% SL
    const whaleBook = makeBook(
      [['0.51', '1000'], ['0.50', '10'], ['0.49', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    const markets = [
      {
        id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: 'no-2',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm3', conditionId: 'cond-3', yesTokenId: 'yes-3', noTokenId: 'no-3',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm4', conditionId: 'cond-4', yesTokenId: 'yes-4', noTokenId: 'no-4',
        closed: false, resolved: false, active: true,
      },
    ];

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(whaleBook) } as any,
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 1, // lower threshold for easier entry
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
        maxPositions: 2,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick(); // entries for market 1 & 2 (maxPositions=2)

    // Should only have 2 orders (maxPositions=2), not 4
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);

    // Another tick should not add more (positions still open, no SL/TP hit)
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('emits trade.executed events on entry', async () => {
    const whaleBook = makeBook(
      [['0.48', '1000'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
    );

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(whaleBook) } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick();
    await tick();

    expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({
        strategy: 'whale-tracker',
        side: 'buy',
      }),
    }));
  });

  it('handles market with no noTokenId', async () => {
    const askWhaleBook = makeBook(
      [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
      [['0.52', '1000'], ['0.53', '10'], ['0.54', '10']],
    );

    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(askWhaleBook) } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: undefined,
          closed: false, resolved: false, active: true,
        }]),
      } as any,
      config: {
        whaleThreshold: 5,
        minWhaleEvents: 2,
        minWhaleVolume: 500,
        imbalanceRatio: 3.0,
      },
    });

    const tick = createWhaleTrackerTick(deps);
    await tick();
    await tick();

    // Should still place order using yesTokenId as fallback
    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(call.tokenId).toBe('yes-1');
  });
});

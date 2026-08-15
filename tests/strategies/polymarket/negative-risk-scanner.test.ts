import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createNegativeRiskScannerTick,
  DEFAULT_CONFIG,
  type NegativeRiskScannerConfig,
  type NegativeRiskScannerDeps,
  getBestAsk,
  getBestBid,
  usdcToTokens,
  calcExitValue,
} from '../../../src/desk/strategies/polymarket/negative-risk-scanner.js';
import type { RawOrderBook } from '../../../src/polymarket/clob-client.js';
import type { GammaMarket } from '../../../src/polymarket/gamma-client.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeBook(
  bids: [string, string][],
  asks: [string, string][]
): RawOrderBook {
  return {
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    timestamp: Date.now(),
  };
}

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm1',
    question: 'Test market?',
    slug: 'test',
    conditionId: 'cond-1',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5', '0.5'],
    volume: 50_000,
    volume24h: 5000,
    liquidity: 5000,
    endDate: '2027-12-31',
    active: true,
    closed: false,
    resolved: false,
    tokens: [],
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.5,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<NegativeRiskScannerDeps> = {}): NegativeRiskScannerDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook(
          [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
          [['0.52', '10'], ['0.53', '10'], ['0.54', '10']]
        )
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-123' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([makeMarket()]),
    } as any,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<NegativeRiskScannerConfig> = {}): NegativeRiskScannerConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('getBestAsk', () => {
  it('returns first ask price', () => {
    const book = makeBook([], [['0.55', '10'], ['0.56', '5']]);
    expect(getBestAsk(book)).toBeCloseTo(0.55, 4);
  });

  it('returns 1 when no asks', () => {
    const book = makeBook([], []);
    expect(getBestAsk(book)).toBe(1);
  });

  it('parses string price to number', () => {
    const book = makeBook([], [['0.489', '100']]);
    expect(getBestAsk(book)).toBeCloseTo(0.489, 4);
  });
});

describe('getBestBid', () => {
  it('returns first bid price', () => {
    const book = makeBook([['0.48', '10'], ['0.47', '5']], []);
    expect(getBestBid(book)).toBeCloseTo(0.48, 4);
  });

  it('returns 0 when no bids', () => {
    const book = makeBook([], []);
    expect(getBestBid(book)).toBe(0);
  });
});

describe('usdcToTokens', () => {
  it('calculates token amount correctly', () => {
    expect(usdcToTokens(10, 0.5)).toBe(20);
    expect(usdcToTokens(10, 0.1)).toBe(100);
    expect(usdcToTokens(10, 2)).toBe(5);
  });

  it('returns 0 for zero price', () => {
    expect(usdcToTokens(10, 0)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(usdcToTokens(10, 0.33)).toBe(30); // 10/0.33 = 30.3 -> 30
  });
});

describe('calcExitValue', () => {
  it('computes exit value and PnL correctly', () => {
    const result = calcExitValue(
      0.6, // yesBid
      0.4, // noBid
      10, // yesSizeUsdc
      10, // noSizeUsdc
      0.5, // yesEntryPrice
      0.5  // noEntryPrice
    );
    // Entry tokens: 10/0.5 = 20 each
    // Exit value: 20*0.6 + 20*0.4 = 12 + 8 = 20
    // Entry cost = 20
    // PnL = 0
    expect(result.exitValue).toBeCloseTo(20, 4);
    expect(result.entryCost).toBe(20);
    expect(result.pnlPct).toBeCloseTo(0, 4);
  });

  it('computes profit when prices increased', () => {
    const result = calcExitValue(0.6, 0.5, 10, 10, 0.5, 0.45);
    // yes tokens: 10/0.5=20 -> exit 20*0.6=12
    // no tokens: 10/0.45≈22.22 -> exit 22.22*0.5≈11.11
    // exit total ≈23.11, entry=20, pnl≈15.5%
    expect(result.exitValue).toBeGreaterThan(20);
    expect(result.pnlPct).toBeGreaterThan(0);
  });
});

// ── Tick factory tests ────────────────────────────────────────────────────────

describe('createNegativeRiskScannerTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function', () => {
    const tick = createNegativeRiskScannerTick(makeConfig(), makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders when total cost >= threshold', async () => {
    const threshold = 0.98;
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(
          makeBook([], [['0.50', '10']]) // yesAsk=0.5, noAsk=0.5 -> sum=1.0
        ),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ threshold }), deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('places buy orders for both legs when sum < threshold', async () => {
    const threshold = 0.98;
    const yesAsk = 0.45;
    const noAsk = 0.50;
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']])) // yes token
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']])), // no token
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({
            yesTokenId: 'yes-token',
            noTokenId: 'no-token',
            volume: 5000,
          }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ threshold }), deps);
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    const calls = deps.orderManager.placeOrder.mock.calls;
    expect(calls[0][0].side).toBe('buy');
    expect(calls[0][0].tokenId).toBe('yes-token');
    expect(calls[1][0].side).toBe('buy');
    expect(calls[1][0].tokenId).toBe('no-token');
  });

  it('respects cooldown after entry', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']])) // yes ask
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']])), // no ask
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ cooldownMs: 1000 }), deps);
    await tick(); // first tick places orders
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);

    // Reset mock
    deps.orderManager.placeOrder.mockClear();
    // Second tick immediately should be on cooldown, no new orders
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips markets below minVolumeUsdc', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ volume: 500, conditionId: 'low-vol' }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ minVolumeUsdc: 1000 }), deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ closed: true, resolved: false }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ closed: false, resolved: true }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without yesTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: undefined }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without noTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ noTokenId: undefined }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('handles empty orderbook gracefully', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook([], [])),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('handles clob API error gracefully', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles gamma API error gracefully', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockRejectedValue(new Error('API down')),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles orderManager.placeOrder failure without crashing', async () => {
    const deps = makeDeps({
      orderManager: {
        placeOrder: vi.fn().mockRejectedValue(new Error('insufficient funds')),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(DEFAULT_CONFIG, deps);
    await expect(tick()).resolves.toBeUndefined();
    // No position should be recorded
    // We can't directly inspect positions, but no orders should be recorded as filled
  });

  it('processes multiple markets in one tick', async () => {
    const markets = [
      makeMarket({ conditionId: 'c1', yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
      makeMarket({ conditionId: 'c2', yesTokenId: 'y2', noTokenId: 'n2', volume: 5000 }),
    ];
    // Both markets have sum < threshold
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']])) // y1
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']])) // n1
          .mockResolvedValueOnce(makeBook([], [['0.44', '10']])) // y2
          .mockResolvedValueOnce(makeBook([], [['0.51', '10']])), // n2
      } as any,
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ threshold: 0.98 }), deps);
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(4);
  });

  it('applies maxOpportunitySizeUsdc correctly', async () => {
    const maxSize = 5;
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          .mockResolvedValueOnce(makeBook([], [['0.10', '100']])) // yesAsk=0.1
          .mockResolvedValueOnce(makeBook([], [['0.10', '100']])), // noAsk=0.1
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y', noTokenId: 'n', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ maxOpportunitySizeUsdc: maxSize }), deps);
    await tick();

    const calls = deps.orderManager.placeOrder.mock.calls;
    // size = round(5 / 0.1) = 50 tokens
    expect(calls[0][0].size).toBe('50');
    expect(calls[1][0].size).toBe('50');
  });

  it('emits trade events on entry', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']]))
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']])),
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(makeConfig({ threshold: 0.98 }), deps);
    await tick();

    expect(deps.eventBus.emit).toHaveBeenCalledTimes(2);
    const firstEvent = deps.eventBus.emit.mock.calls[0];
    expect(firstEvent[0]).toBe('trade.executed');
    expect(firstEvent[1].trade.side).toBe('buy');
    expect(firstEvent[1].trade.marketId).toBe('cond-1');
  });

  // -- Exit tests -------------------------------------------------------------

  it('exits positions after maxHoldMs', async () => {
    vi.useFakeTimers();
    const maxHoldMs = 1000;
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          // Entry: both asks
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']]))
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']]))
          // Exit: both bids
          .mockResolvedValueOnce(makeBook([['0.55', '10']], []))
          .mockResolvedValueOnce(makeBook([['0.50', '10']], [])),
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(
      makeConfig({ maxHoldMs, cooldownMs: 0 }),
      deps
    );

    // First tick: entry
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    deps.orderManager.placeOrder.mockClear();

    // Advance time beyond maxHoldMs
    vi.advanceTimersByTime(maxHoldMs + 100);

    // Second tick: exit
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2); // two sell orders
    const sellCalls = deps.orderManager.placeOrder.mock.calls;
    expect(sellCalls[0][0].side).toBe('sell');
    expect(sellCalls[1][0].side).toBe('sell');
  });

  it('exits on take profit', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          // Entry asks
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']]))
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']]))
          // Exit bids (higher)
          .mockResolvedValueOnce(makeBook([['0.60', '10']], []))
          .mockResolvedValueOnce(makeBook([['0.60', '10']], [])),
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(
      makeConfig({ takeProfitPct: 0.02, cooldownMs: 0 }),
      deps
    );

    // Entry
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    deps.orderManager.placeOrder.mockClear();

    // Second tick: should trigger exit due to profit
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    const sellCalls = deps.orderManager.placeOrder.mock.calls;
    expect(sellCalls[0][0].side).toBe('sell');
  });

  it('exits on stop loss', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn()
          // Entry: asks with sum < threshold
          .mockResolvedValueOnce(makeBook([], [['0.45', '10']])) // yes ask
          .mockResolvedValueOnce(makeBook([], [['0.50', '10']])) // no ask
          // Exit: bids (lower)
          .mockResolvedValueOnce(makeBook([['0.30', '10']], [])) // yes bid
          .mockResolvedValueOnce(makeBook([['0.30', '10']], [])), // no bid
      } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ yesTokenId: 'y1', noTokenId: 'n1', volume: 5000 }),
        ]),
      } as any,
    });
    const tick = createNegativeRiskScannerTick(
      makeConfig({ stopLossPct: 0.02, cooldownMs: 0 }),
      deps
    );

    await tick(); // entry
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    deps.orderManager.placeOrder.mockClear();

    await tick(); // exit
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    const sellCalls = deps.orderManager.placeOrder.mock.calls;
    expect(sellCalls[0][0].side).toBe('sell');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});

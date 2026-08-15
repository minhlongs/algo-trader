import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNearResolution,
  detectConvergenceSignal,
  hasMomentum,
  createResolutionFrontrunnerTick,
  type ResolutionFrontrunnerDeps,
} from '../../src/desk/strategies/polymarket/resolution-frontrunner-v2';
import type { RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { GammaMarket } from '../../src/desk/polymarket/gamma-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBook(bids: [string, string][], asks: [string, string][]): RawOrderBook {
  return {
    market: 'test-market',
    asset_id: 'test-token',
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    hash: 'abc',
  };
}

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm1',
    question: 'Test?',
    slug: 'test',
    conditionId: 'cond-1',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.90,
    noPrice: 0.10,
    volume: 50000,
    volume24h: 20000,
    liquidity: 10000,
    endDate: new Date(Date.now() + 12 * 3600_000).toISOString(), // 12h from now
    active: true,
    closed: false,
    resolved: false,
    outcome: null,
    ...overrides,
  };
}

const BASE_NOW = 1700000000000;

function makeDeps(overrides: Partial<ResolutionFrontrunnerDeps> = {}): ResolutionFrontrunnerDeps {
  const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook([['0.89', '100']], [['0.91', '100']]),
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([
        makeMarket({ endDate }),
      ]),
    } as any,
    clock: () => BASE_NOW,
    ...overrides,
  };
}

// ── isNearResolution ────────────────────────────────────────────────────────

describe('isNearResolution', () => {
  const now = 1700000000000;
  const windowMs = 86_400_000; // 24h

  it('returns true when endDate is within window', () => {
    const endDate = new Date(now + 12 * 3600_000).toISOString(); // 12h from now
    expect(isNearResolution(endDate, windowMs, now)).toBe(true);
  });

  it('returns true when endDate is exactly at window boundary', () => {
    const endDate = new Date(now + windowMs).toISOString();
    expect(isNearResolution(endDate, windowMs, now)).toBe(true);
  });

  it('returns false when endDate is outside window', () => {
    const endDate = new Date(now + 48 * 3600_000).toISOString(); // 48h from now
    expect(isNearResolution(endDate, windowMs, now)).toBe(false);
  });

  it('returns false when endDate is in the past', () => {
    const endDate = new Date(now - 3600_000).toISOString(); // 1h ago
    expect(isNearResolution(endDate, windowMs, now)).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isNearResolution('not-a-date', windowMs, now)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNearResolution('', windowMs, now)).toBe(false);
  });
});

// ── detectConvergenceSignal ─────────────────────────────────────────────────

describe('detectConvergenceSignal', () => {
  const highThreshold = 0.85;
  const lowThreshold = 0.15;

  it('returns buy-yes when price > highThreshold', () => {
    expect(detectConvergenceSignal(0.90, highThreshold, lowThreshold)).toBe('buy-yes');
  });

  it('returns buy-yes at boundary (just above)', () => {
    expect(detectConvergenceSignal(0.86, highThreshold, lowThreshold)).toBe('buy-yes');
  });

  it('returns buy-no when price < lowThreshold', () => {
    expect(detectConvergenceSignal(0.10, highThreshold, lowThreshold)).toBe('buy-no');
  });

  it('returns buy-no at boundary (just below)', () => {
    expect(detectConvergenceSignal(0.14, highThreshold, lowThreshold)).toBe('buy-no');
  });

  it('returns null when price is in the middle', () => {
    expect(detectConvergenceSignal(0.50, highThreshold, lowThreshold)).toBeNull();
  });

  it('returns null when price is at highThreshold exactly', () => {
    expect(detectConvergenceSignal(0.85, highThreshold, lowThreshold)).toBeNull();
  });

  it('returns null when price is at lowThreshold exactly', () => {
    expect(detectConvergenceSignal(0.15, highThreshold, lowThreshold)).toBeNull();
  });
});

// ── hasMomentum ─────────────────────────────────────────────────────────────

describe('hasMomentum', () => {
  it('returns true for upward momentum', () => {
    const prices = [0.80, 0.82, 0.84, 0.86, 0.88];
    expect(hasMomentum(prices, 'up', 5)).toBe(true);
  });

  it('returns true for downward momentum', () => {
    const prices = [0.20, 0.18, 0.16, 0.14, 0.12];
    expect(hasMomentum(prices, 'down', 5)).toBe(true);
  });

  it('returns false when insufficient ticks', () => {
    const prices = [0.80, 0.82, 0.84];
    expect(hasMomentum(prices, 'up', 5)).toBe(false);
  });

  it('returns false for flat prices when expecting up', () => {
    const prices = [0.50, 0.49, 0.50, 0.49, 0.50];
    // Some moves up, some down — not consistent enough
    expect(hasMomentum(prices, 'up', 5)).toBe(false);
  });

  it('returns false for opposite direction momentum', () => {
    const prices = [0.88, 0.86, 0.84, 0.82, 0.80];
    expect(hasMomentum(prices, 'up', 5)).toBe(false);
  });

  it('uses only the last minTicks entries from longer history', () => {
    // First part goes down, last 5 go up
    const prices = [0.90, 0.85, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90];
    expect(hasMomentum(prices, 'up', 5)).toBe(true);
  });

  it('accepts equal-price ticks as momentum (not against)', () => {
    const prices = [0.80, 0.80, 0.82, 0.82, 0.84];
    expect(hasMomentum(prices, 'up', 5)).toBe(true);
  });
});

// ── Tick factory: integration ───────────────────────────────────────────────

describe('createResolutionFrontrunnerTick', () => {
  it('returns a function', () => {
    const tick = createResolutionFrontrunnerTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders on first tick (insufficient momentum history)', async () => {
    const deps = makeDeps();
    const tick = createResolutionFrontrunnerTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters on near-resolution market with convergence signal and momentum', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Gradually rising price above 0.85
        const price = 0.86 + callCount * 0.005;
        const p = Math.min(price, 0.95);
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      config: { momentumTicks: 3 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    // Run enough ticks to build momentum
    for (let i = 0; i < 5; i++) {
      await tick();
    }

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({ strategy: 'resolution-frontrunner' }),
    }));
  });

  it('exits on take-profit', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    // Exit book: mid 0.98, entry ~0.89 → gain ~10% > 3% TP
    const exitBook = makeBook([['0.97', '100']], [['0.99', '100']]);
    let entryCallCount = 0;
    let phase: 'entry' | 'exit' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'exit') return Promise.resolve(exitBook);
        // Rising prices to build momentum
        entryCallCount++;
        const p = 0.86 + entryCallCount * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const placeOrder = vi.fn().mockResolvedValue({ id: 'order-1' });

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      orderManager: { placeOrder } as any,
      config: { momentumTicks: 3, takeProfitPct: 0.03 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    // Build momentum + enter
    for (let i = 0; i < 5; i++) await tick();
    expect(placeOrder).toHaveBeenCalledTimes(1);

    // Switch to exit phase BEFORE tick so checkExits gets exit prices
    phase = 'exit';
    // Advance Date.now past price cache TTL (5s) so getCurrentPrice fetches fresh
    dateNowSpy.mockReturnValue(BASE_NOW + 6000);
    await tick();
    expect(placeOrder).toHaveBeenCalledTimes(2);
    dateNowSpy.mockRestore();
  });

  it('exits on stop-loss', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    // Exit book: mid 0.81, entry ~0.89 → loss ~9% > 5% SL
    const slBook = makeBook([['0.80', '100']], [['0.82', '100']]);
    let entryCallCount = 0;
    let phase: 'entry' | 'exit' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'exit') return Promise.resolve(slBook);
        entryCallCount++;
        const p = 0.86 + entryCallCount * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const placeOrder = vi.fn().mockResolvedValue({ id: 'order-1' });

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      orderManager: { placeOrder } as any,
      config: { momentumTicks: 3, stopLossPct: 0.05 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();
    expect(placeOrder).toHaveBeenCalledTimes(1);

    phase = 'exit';
    dateNowSpy.mockReturnValue(BASE_NOW + 6000);
    await tick();
    expect(placeOrder).toHaveBeenCalledTimes(2);
    dateNowSpy.mockRestore();
  });

  it('exits on max hold time', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    let currentTime = BASE_NOW;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          const p = 0.86 + callCount * 0.005;
          return Promise.resolve(makeBook(
            [[String((p - 0.01).toFixed(2)), '100']],
            [[String((p + 0.01).toFixed(2)), '100']],
          ));
        }
        // After entry: price stays flat (no TP/SL hit)
        return Promise.resolve(makeBook([['0.90', '100']], [['0.92', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      clock: () => currentTime,
      config: { momentumTicks: 3, maxHoldMs: 14_400_000 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    // Advance time past max hold + price cache TTL
    dateNowSpy.mockReturnValue(BASE_NOW + 14_401_000);
    currentTime = BASE_NOW + 14_400_001;
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    dateNowSpy.mockRestore();
  });

  it('exits on market resolution', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    let resolved = false;
    const market = makeMarket({ endDate, volume24h: 20000 });

    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          const p = 0.86 + callCount * 0.005;
          return Promise.resolve(makeBook(
            [[String((p - 0.01).toFixed(2)), '100']],
            [[String((p + 0.01).toFixed(2)), '100']],
          ));
        }
        return Promise.resolve(makeBook([['0.90', '100']], [['0.92', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockImplementation(() => {
          return Promise.resolve([{ ...market, resolved }]);
        }),
      } as any,
      config: { momentumTicks: 3 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);

    // Market resolves
    resolved = true;
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('skips resolved markets for entry', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ resolved: true }),
        ]),
      } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets for entry', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ closed: true }),
        ]),
      } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips low-volume markets', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 500 }), // below default 10000
        ]),
      } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets outside resolution window', async () => {
    const endDate = new Date(BASE_NOW + 48 * 3600_000).toISOString(); // 48h away
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await tick();
    // getOrderBook should not be called since market is outside window
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('respects cooldown after exit', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let currentTime = BASE_NOW;
    const exitBook = makeBook([['0.97', '100']], [['0.99', '100']]);
    let entryCallCount = 0;
    let phase: 'entry' | 'exit' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'exit') return Promise.resolve(exitBook);
        entryCallCount++;
        const p = 0.86 + entryCallCount * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const placeOrder = vi.fn().mockResolvedValue({ id: 'order-1' });

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      orderManager: { placeOrder } as any,
      clock: () => currentTime,
      config: { momentumTicks: 3, cooldownMs: 300_000, takeProfitPct: 0.03 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    // Build momentum + enter
    for (let i = 0; i < 5; i++) await tick();
    expect(placeOrder).toHaveBeenCalledTimes(1);

    // Exit
    phase = 'exit';
    dateNowSpy.mockReturnValue(BASE_NOW + 6000);
    await tick();
    expect(placeOrder).toHaveBeenCalledTimes(2);

    // Reset for re-entry attempt
    // Tick again immediately — should be on cooldown
    await tick();
    // Should not have placed another entry (still 2 calls total)
    const totalCalls = placeOrder.mock.calls.length;
    expect(totalCalls).toBe(2);

    // Advance past cooldown: exit happened at Date.now=BASE_NOW+6000, cooldown=300s
    // Need Date.now > BASE_NOW + 6000 + 300_000 = BASE_NOW + 306_000
    dateNowSpy.mockReturnValue(BASE_NOW + 307_000);
    currentTime = BASE_NOW + 300_001;
    // Switch back to entry phase with rising prices
    phase = 'entry';
    entryCallCount = 0;
    // Rebuild momentum from fresh
    for (let i = 0; i < 5; i++) await tick();
    expect(placeOrder.mock.calls.length).toBeGreaterThan(2);
    dateNowSpy.mockRestore();
  });

  it('respects maxPositions', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        const p = 0.86 + (callCount % 10) * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const m1 = makeMarket({ id: 'm1', conditionId: 'c1', yesTokenId: 'y1', noTokenId: 'n1', endDate, volume24h: 20000 });
    const m2 = makeMarket({ id: 'm2', conditionId: 'c2', yesTokenId: 'y2', noTokenId: 'n2', endDate, volume24h: 20000 });
    const m3 = makeMarket({ id: 'm3', conditionId: 'c3', yesTokenId: 'y3', noTokenId: 'n3', endDate, volume24h: 20000 });
    const m4 = makeMarket({ id: 'm4', conditionId: 'c4', yesTokenId: 'y4', noTokenId: 'n4', endDate, volume24h: 20000 });

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([m1, m2, m3, m4]),
      } as any,
      config: { momentumTicks: 3, maxPositions: 2 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    // Run just enough ticks for momentum + one entry scan
    for (let i = 0; i < 4; i++) await tick();

    // After 4 ticks, should have at most 2 buy entries (maxPositions=2)
    const entryCalls = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any[]) => c[0].side === 'buy',
    );
    expect(entryCalls.length).toBeLessThanOrEqual(2);
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API down')) } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error during scan', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
    });
    const tick = createResolutionFrontrunnerTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('emits trade.executed event on entry', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        const p = 0.86 + callCount * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      config: { momentumTicks: 3 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();

    const emitCalls = (deps.eventBus.emit as any).mock.calls;
    const tradeEvents = emitCalls.filter((c: any[]) => c[0] === 'trade.executed');
    expect(tradeEvents.length).toBeGreaterThanOrEqual(1);
    expect(tradeEvents[0][1].trade.strategy).toBe('resolution-frontrunner');
  });

  it('emits trade.executed event on exit', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    const exitBook = makeBook([['0.97', '100']], [['0.99', '100']]);
    let entryCallCount = 0;
    let phase: 'entry' | 'exit' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'exit') return Promise.resolve(exitBook);
        entryCallCount++;
        const p = 0.86 + entryCallCount * 0.005;
        return Promise.resolve(makeBook(
          [[String((p - 0.01).toFixed(2)), '100']],
          [[String((p + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const placeOrder = vi.fn().mockResolvedValue({ id: 'order-1' });
    const emit = vi.fn();

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      orderManager: { placeOrder } as any,
      eventBus: { emit } as any,
      config: { momentumTicks: 3, takeProfitPct: 0.03 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();
    expect(placeOrder).toHaveBeenCalledTimes(1);

    phase = 'exit';
    dateNowSpy.mockReturnValue(BASE_NOW + 6000);
    await tick(); // exit

    const tradeEvents = emit.mock.calls.filter((c: any[]) => c[0] === 'trade.executed');
    expect(tradeEvents.length).toBeGreaterThanOrEqual(2);
    // The exit event
    const exitEvent = tradeEvents[tradeEvents.length - 1][1].trade;
    expect(exitEvent.strategy).toBe('resolution-frontrunner');
    expect(exitEvent.side).toBe('sell');
    dateNowSpy.mockRestore();
  });

  it('handles buy-no signal for low-price markets', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Price dropping below 0.15
        const p = 0.14 - callCount * 0.005;
        const price = Math.max(p, 0.05);
        return Promise.resolve(makeBook(
          [[String((price - 0.01).toFixed(2)), '100']],
          [[String((price + 0.01).toFixed(2)), '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000, yesPrice: 0.10, noPrice: 0.90 }),
        ]),
      } as any,
      config: { momentumTicks: 3 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 5; i++) await tick();

    // Should have placed a buy order for NO token
    const buyCalls = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any[]) => c[0].side === 'buy',
    );
    expect(buyCalls.length).toBeGreaterThanOrEqual(1);
    // Should use the NO token
    expect(buyCalls[0][0].tokenId).toBe('no-1');
  });

  it('does not enter when price is in mid-range', async () => {
    const endDate = new Date(BASE_NOW + 12 * 3600_000).toISOString();
    const clob = {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook([['0.49', '100']], [['0.51', '100']]),
      ),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ endDate, volume24h: 20000 }),
        ]),
      } as any,
      config: { momentumTicks: 3 },
    });

    const tick = createResolutionFrontrunnerTick(deps);
    for (let i = 0; i < 10; i++) await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });
});

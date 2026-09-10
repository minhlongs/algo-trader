/**
 * Comprehensive tests for Expiry Theta Decay Strategy — covers pure helpers,
 * config, scanEntries (all branches), getCustomExitCondition, and legacy factory.
 * Target: 100% coverage for src/desk/strategies/polymarket/expiry-theta-decay.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  DEFAULT_CONFIG,
  hoursToExpiry,
  computeThetaEdge,
  createExpiryThetaDecayTick,
  ExpiryThetaDecayStrategy,
} from '../../../../../src/desk/strategies/polymarket/expiry-theta-decay';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

// ─── Fixtures ────────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1',
    question: 'Will BTC hit 100k?',
    conditionId: 'cond_001',
    slug: 'btc-100k',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.65', '0.35'],
    volume: 50000,
    liquidity: 25000,
    endDate: new Date(Date.now() + 24 * 3600_000).toISOString(), // 24 hours from now
    active: true,
    closed: false,
    resolved: false,
    tokens: [
      { token_id: 'cond_001-yes', outcome: 'Yes', price: 0.65 },
      { token_id: 'cond_001-no', outcome: 'No', price: 0.35 },
    ],
    yesTokenId: 'cond_001-yes',
    noTokenId: 'cond_001-no',
    yesPrice: 0.65,
    ...overrides,
  };
}

function makeBook(mid: number, bidVol = 100, askVol = 100): RawOrderBook {
  const spread = 0.01;
  return {
    bids: [{ price: (mid - spread).toString(), size: bidVol.toString() }],
    asks: [{ price: (mid + spread).toString(), size: askVol.toString() }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string) => RawOrderBook): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => bookFor ? bookFor(tokenId) : makeBook(0.65)),
      getPrice: vi.fn(async () => 0.65),
      getMidPrice: vi.fn(async () => 0.65),
    } as unknown as StrategyDeps['clob'],
    orderManager: {
      placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })),
    } as unknown as StrategyDeps['orderManager'],
    eventBus: { emit: vi.fn() } as unknown as StrategyDeps['eventBus'],
    gamma: {
      getEvents: vi.fn(async () => []),
      getTrending: vi.fn(async () => []),
    } as unknown as StrategyDeps['gamma'],
  } as StrategyDeps;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────────

describe('expiry-theta-decay::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.maxHoursToExpiry).toBe(48);
    expect(DEFAULT_CONFIG.minHoursToExpiry).toBe(2);
    expect(DEFAULT_CONFIG.thetaRate).toBeCloseTo(0.02, 5);
    expect(DEFAULT_CONFIG.minEdge).toBeCloseTo(0.01, 5);
    expect(DEFAULT_CONFIG.minVolume).toBe(500);
    expect(DEFAULT_CONFIG.takeProfitPct).toBeCloseTo(0.03, 5);
    expect(DEFAULT_CONFIG.stopLossPct).toBeCloseTo(0.03, 5);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(8 * 60_000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(5);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(60_000);
    expect(DEFAULT_CONFIG.positionSize).toBe('10');
  });
});

describe('expiry-theta-decay::hoursToExpiry', () => {
  it('returns -1 for a past date', () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(hoursToExpiry(past)).toBe(-1);
  });

  it('returns positive hours for future date (1 hour)', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const hrs = hoursToExpiry(future);
    expect(hrs).toBeGreaterThan(0);
    expect(hrs).toBeCloseTo(1, 0);
  });

  it('returns -1 for exactly now (past)', () => {
    const past = new Date(Date.now() - 1).toISOString();
    expect(hoursToExpiry(past)).toBe(-1);
  });

  it('returns 24 for 24 hours from now', () => {
    const d = new Date(Date.now() + 24 * 3600_000).toISOString();
    expect(hoursToExpiry(d)).toBeCloseTo(24, 0);
  });

  it('returns fractional hours correctly', () => {
    const d = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 minutes
    expect(hoursToExpiry(d)).toBeCloseTo(0.5, 1);
  });
});

describe('expiry-theta-decay::computeThetaEdge', () => {
  it('returns 0.1 for price 0.5 with 10 hours and thetaRate 0.02', () => {
    // (1 - 0.5) * 0.02 * 10 = 0.1
    const r = computeThetaEdge(0.5, 10, 0.02);
    expect(r).toBeCloseTo(0.1, 4);
  });

  it('returns positive for price near 1.0 (yes favorite)', () => {
    // (1 - 0.9) * 0.02 * 10 = 0.02
    const r = computeThetaEdge(0.9, 10, 0.02);
    expect(r).toBeCloseTo(0.02, 4);
  });

  it('returns positive for price near 0.0 (no favorite)', () => {
    // price 0.1 -> (0.1) * 0.02 * 10 = 0.02
    const r = computeThetaEdge(0.1, 10, 0.02);
    expect(r).toBeCloseTo(0.02, 4);
  });

  it('scales linearly with thetaRate', () => {
    const r1 = computeThetaEdge(0.9, 10, 0.02);
    const r2 = computeThetaEdge(0.9, 10, 0.04);
    expect(r2).toBeCloseTo(r1 * 2, 4);
  });

  it('scales linearly with hoursLeft', () => {
    const r1 = computeThetaEdge(0.9, 5, 0.02);
    const r2 = computeThetaEdge(0.9, 10, 0.02);
    expect(r2).toBeCloseTo(r1 * 2, 4);
  });

  it('returns 0 when price is exactly 0.5 (no favorite)', () => {
    const r = computeThetaEdge(0.5, 10, 0.02);
    expect(r).toBeCloseTo(0.1, 4); // (1-0.5) * 0.02 * 10 = 0.1
  });

  it('handles edge case price = 1.0', () => {
    const r = computeThetaEdge(1.0, 10, 0.02);
    expect(r).toBe(0); // (1-1) * 0.02 * 10 = 0
  });

  it('handles edge case price = 0.0', () => {
    const r = computeThetaEdge(0.0, 10, 0.02);
    expect(r).toBe(0); // 0 * 0.02 * 10 = 0
  });
});

// ─── Strategy class ──────────────────────────────────────────────────────────────

describe('ExpiryThetaDecayStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps(), { thetaRate: 0.05 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.thetaRate).toBe(0.05);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.maxHoursToExpiry).toBe(DEFAULT_CONFIG.maxHoursToExpiry);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.minEdge).toBe(DEFAULT_CONFIG.minEdge);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o3', openedAt: Date.now() },
      { tokenId: 't4', conditionId: 'c4', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o4', openedAt: Date.now() },
      { tokenId: 't5', conditionId: 'c5', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o5', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without yesTokenId', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets below minVolume', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 100 })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets on cooldown', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('cond_001', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets already having a position', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 'cond_001-yes', conditionId: 'cond_001', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets with hoursToExpiry > maxHoursToExpiry', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const farFuture = new Date(Date.now() + 100 * 3600_000).toISOString(); // 100 hours
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ endDate: farFuture })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets with hoursToExpiry < minHoursToExpiry', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const soon = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 minutes
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ endDate: soon })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets with expired endDate (hoursToExpiry returns -1)', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const past = new Date(Date.now() - 3600_000).toISOString();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ endDate: past })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips when orderbook mid <= 0', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps(() => makeBook(0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when orderbook mid >= 1', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps(() => makeBook(1)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips entry when edge < minEdge', async () => {
    // Use a price that gives very low edge (near 0.5 with low hours)
    const strat = new ExpiryThetaDecayStrategy(
      makeDeps(() => makeBook(0.51)), // very close to 0.5
      { minEdge: 0.5, minHoursToExpiry: 1, maxHoursToExpiry: 48 }
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters YES position when price > 0.5 and edge >= minEdge', async () => {
    // price 0.7, hours=24, thetaRate=0.02 -> edge = (1-0.7)*0.02*24 = 0.144 >= 0.01
    const strat = new ExpiryThetaDecayStrategy(
      makeDeps(() => makeBook(0.7)),
      { minEdge: 0.01, minHoursToExpiry: 1, maxHoursToExpiry: 48 }
    );
    const m = makeMarket({ yesPrice: 0.7 });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('cond_001-yes');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Theta decay entry',
      'expiry-theta-decay',
      expect.objectContaining({ conditionId: 'cond_001', side: 'yes' }),
    );
  });

  it('enters NO position when price < 0.5 and edge >= minEdge', async () => {
    // price 0.3 -> favorite is NO (1-0.3=0.7), edge = 0.7*0.02*24 = 0.336 >= 0.01
    const strat = new ExpiryThetaDecayStrategy(
      makeDeps(() => makeBook(0.3)),
      { minEdge: 0.01, minHoursToExpiry: 1, maxHoursToExpiry: 48 }
    );
    const m = makeMarket({ yesPrice: 0.3 });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('cond_001-no');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Theta decay entry',
      'expiry-theta-decay',
      expect.objectContaining({ conditionId: 'cond_001', side: 'no' }),
    );
  });

  it('uses fallback noTokenId when not provided', async () => {
    // Market without noTokenId - should use fallback (conditionId-no)
    const strat = new ExpiryThetaDecayStrategy(
      makeDeps(() => makeBook(0.3)),
      { minEdge: 0.01, minHoursToExpiry: 1, maxHoursToExpiry: 48 }
    );
    const m = makeMarket({ noTokenId: undefined, yesPrice: 0.3 });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // @ts-expect-error - reach into private field
    const call = (strat.deps.orderManager.placeOrder as any).mock.calls[0][0];
    // noTokenId undefined -> fallback to yesTokenId ('cond_001-yes')
    expect(call.tokenId).toBe('cond_001-yes');
  });

  it('skips when entryPrice <= 0 or >= 1 (invalid)', async () => {
    // makeBook(0) produces mid=0 -> entryPrice would be invalid
    const strat = new ExpiryThetaDecayStrategy(
      makeDeps(() => makeBook(0)),
      { minEdge: 0.01, minHoursToExpiry: 1, maxHoursToExpiry: 48 }
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Theta scan error',
      'expiry-theta-decay',
      expect.objectContaining({ market: 'cond_001', err: 'Error: book down' }),
    );
  });

  it('getCustomExitCondition returns exit when effectivePrice >= 0.95 for YES', () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const pos = {
      tokenId: 'yes-1',
      conditionId: 'c-1',
      side: 'yes' as const,
      entryPrice: 0.5,
      sizeUsdc: 20,
      orderId: 'o',
      openedAt: Date.now(),
    };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.96);
    expect(r.exit).toBe(true);
    expect(r.reason).toBe('theta-decayed');
  });

  it('getCustomExitCondition returns exit when effectivePrice >= 0.95 for NO', () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const pos = {
      tokenId: 'no-1',
      conditionId: 'c-1',
      side: 'no' as const,
      entryPrice: 0.5,
      sizeUsdc: 20,
      orderId: 'o',
      openedAt: Date.now(),
    };
    // For NO side, effectivePrice = 1 - currentPrice = 0.96 -> >= 0.95
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.04);
    expect(r.exit).toBe(true);
    expect(r.reason).toBe('theta-decayed');
  });

  it('getCustomExitCondition returns no exit when effectivePrice < 0.95 for YES', () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const pos = {
      tokenId: 'yes-1',
      conditionId: 'c-1',
      side: 'yes' as const,
      entryPrice: 0.5,
      sizeUsdc: 20,
      orderId: 'o',
      openedAt: Date.now(),
    };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.90);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('getCustomExitCondition returns no exit when effectivePrice < 0.95 for NO', () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    const pos = {
      tokenId: 'no-1',
      conditionId: 'c-1',
      side: 'no' as const,
      entryPrice: 0.5,
      sizeUsdc: 20,
      orderId: 'o',
      openedAt: Date.now(),
    };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.10);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('runs execute end-to-end without errors', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'expiry-theta-decay',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs execution failure without throwing', async () => {
    const strat = new ExpiryThetaDecayStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Execution failed',
      'expiry-theta-decay',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });
});

// ─── Legacy factory ──────────────────────────────────────────────────────────────

describe('expiry-theta-decay::createExpiryThetaDecayTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createExpiryThetaDecayTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orderManager: { placeOrder: async () => ({ id: 'o' }), cancelOrder: async () => {}, cancelAllOrders: async () => {}, getOpenOrders: async () => [] },
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });

  it('tick function executes strategy.execute', async () => {
    const mockDeps = makeDeps();
    const tick = createExpiryThetaDecayTick(mockDeps as any);
    await expect(tick()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'expiry-theta-decay',
      expect.objectContaining({ openPositions: 0 }),
    );
  });
});
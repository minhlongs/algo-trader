/**
 * Tests for volatility-surface-arb — the Volatility Surface Arbitrage strategy.
 *
 * Exercises the pure helpers (estimateIV / computeVolRatio / getVolArbDirection),
 * DEFAULT_CONFIG, the constructor config merge, scanEntries() IV-driven entry
 * filtering (via a mocked CLOB + orderManager + eventBus), and
 * getCustomExitCondition() vol-convergence exits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import { StrategyDeps } from '../base-polymarket-strategy-types';
import {
  DEFAULT_CONFIG,
  estimateIV,
  computeVolRatio,
  getVolArbDirection,
  createVolatilitySurfaceArbTick,
  VolatilitySurfaceArbStrategy,
} from '../volatility-surface-arb';

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1',
    question: 'Will X happen?',
    conditionId: 'c-1',
    slug: 'x',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5', '0.5'],
    volume: 5000,
    liquidity: 10000,
    endDate: '2030-01-01',
    active: true,
    closed: false,
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.5,
    ...overrides,
  };
}

/** Book with configurable mid, spread and depth. */
function makeBook(opts: { mid?: number; spread?: number; depth?: number } = {}): RawOrderBook {
  const mid = opts.mid ?? 0.5;
  const spread = opts.spread ?? 0.02;
  const depth = opts.depth ?? 100;
  const bid = mid - spread / 2;
  const ask = mid + spread / 2;
  return {
    bids: [
      { price: bid.toString(), size: depth.toString() },
      { price: (bid - 0.01).toString(), size: depth.toString() },
    ],
    asks: [
      { price: ask.toString(), size: depth.toString() },
      { price: (ask + 0.01).toString(), size: depth.toString() },
    ],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string) => RawOrderBook): StrategyDeps {
  const getBook = (tokenId: string) => (bookFor ? bookFor(tokenId) : makeBook());
  return {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => getBook(tokenId)),
    } as unknown as StrategyDeps['clob'],
    orderManager: {
      placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })),
    } as unknown as StrategyDeps['orderManager'],
    eventBus: { emit: vi.fn() } as unknown as StrategyDeps['eventBus'],
    gamma: {
      getTrending: vi.fn(async () => []),
    } as unknown as StrategyDeps['gamma'],
  } as StrategyDeps;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('volatility-surface-arb::DEFAULT_CONFIG', () => {
  it('exposes the documented vol-surface defaults', () => {
    expect(DEFAULT_CONFIG).toEqual({
      minVolRatio: 1.5,
      exitVolRatio: 1.15,
      depthLevels: 5,
      minVolume: 2000,
      takeProfitPct: 0.04,
      stopLossPct: 0.025,
      maxHoldMs: 15 * 60_000,
      maxPositions: 3,
      cooldownMs: 180_000,
      positionSize: '15',
    });
  });
});

describe('volatility-surface-arb::estimateIV', () => {
  it('returns 1 when total depth is zero', () => {
    const book = makeBook({ depth: 0 });
    expect(estimateIV(book, 5)).toBe(1);
  });

  it('produces a higher IV for a wide-spread shallow book', () => {
    const calm = makeBook({ spread: 0.01, depth: 1000 });
    const wild = makeBook({ spread: 0.2, depth: 10 });
    expect(estimateIV(wild, 5)).toBeGreaterThan(estimateIV(calm, 5));
  });

  it('respects the levels parameter (fewer levels = less depth)', () => {
    const book = makeBook({ depth: 100 });
    expect(estimateIV(book, 1)).toBeGreaterThan(0);
  });
});

describe('volatility-surface-arb::computeVolRatio', () => {
  it('returns 1 when the denominator is not positive', () => {
    expect(computeVolRatio(5, 0)).toBe(1);
    expect(computeVolRatio(5, -1)).toBe(1);
  });

  it('returns a ratio >= 1 regardless of argument order', () => {
    expect(computeVolRatio(10, 5)).toBe(2);
    expect(computeVolRatio(5, 10)).toBe(2);
  });

  it('returns 1 when both IVs are equal', () => {
    expect(computeVolRatio(3, 3)).toBe(1);
  });
});

describe('volatility-surface-arb::getVolArbDirection', () => {
  it('"yes" when Polymarket IV is lower (undervalued)', () => {
    expect(getVolArbDirection(1.0, 2.0)).toBe('yes');
  });

  it('"no" when Polymarket IV is higher (overvalued)', () => {
    expect(getVolArbDirection(2.0, 1.0)).toBe('no');
  });

  it('null when both IVs are equal', () => {
    expect(getVolArbDirection(1.5, 1.5)).toBeNull();
  });
});

// ── Factory ───────────────────────────────────────────────────────────────────

describe('volatility-surface-arb::createVolatilitySurfaceArbTick', () => {
  it('returns a tick function bound to a fresh strategy', () => {
    const tick = createVolatilitySurfaceArbTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});

// ── Constructor / config merge ────────────────────────────────────────────────

describe('VolatilitySurfaceArbStrategy config', () => {
  it('merges overrides on top of DEFAULT_CONFIG', () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps(), { minVolRatio: 2.0 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.minVolRatio).toBe(2.0);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.depthLevels).toBe(DEFAULT_CONFIG.depthLevels);
  });
});

// ── scanEntries: entry filtering ──────────────────────────────────────────────

describe('VolatilitySurfaceArbStrategy.scanEntries filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips markets with no yesTokenId', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets already holding a position', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push({
      tokenId: 'yes-1', conditionId: 'c-1', side: 'yes',
      entryPrice: 0.5, sizeUsdc: 15, orderId: 'o', openedAt: Date.now(),
    });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets on cooldown', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('c-1', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips scanning once at max positions', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o3', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets below minVolume', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 500 })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips books whose mid is at the boundaries', async () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps(() => makeBook({ mid: 0.999 })));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter when the vol ratio is below minVolRatio', async () => {
    // spread 0.01, depth 1 -> totalDepth 4, IV = 1/log10(14) ≈ 0.814
    // ratio vs 1.0 reference = 1.0/0.814 ≈ 1.23 < 1.5 -> no entry
    const strat = new VolatilitySurfaceArbStrategy(makeDeps(() => makeBook({ spread: 0.01, depth: 1 })));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters a "yes" fade when market IV is low vs reference', async () => {
    // spread 0.001, depth 100 -> totalDepth 400, IV = 0.1/log10(410) ≈ 0.0383
    // ratio vs 1.0 reference = 1.0/0.0383 ≈ 26 > 1.5, marketIV < 1.0 -> dir 'yes'
    const strat = new VolatilitySurfaceArbStrategy(makeDeps(() => makeBook({ spread: 0.001, depth: 100 })));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = (strat.deps.orderManager.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.tokenId).toBe('yes-1');
    expect(call.orderType).toBe('GTC');
  });

  it('enters a "no" fade when market IV is high vs reference', async () => {
    // shallow + wide-spread book -> high IV > 1.0 -> ratio = IV/1.0 > 1.5, dir 'no'
    const strat = new VolatilitySurfaceArbStrategy(makeDeps(() => makeBook({ spread: 0.5, depth: 1 })));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = (strat.deps.orderManager.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.tokenId).toBe('no-1');
  });

  it('swallows and logs a CLOB error without throwing', async () => {
    const deps = makeDeps();
    (deps.clob.getOrderBook as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('CLOB down'));
    const strat = new VolatilitySurfaceArbStrategy(deps);
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
  });
});

// ── getCustomExitCondition: vol-convergence exits ─────────────────────────────

describe('VolatilitySurfaceArbStrategy.getCustomExitCondition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not exit when no book is provided', () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const verdict = strat.getCustomExitCondition(pos, 0.5);
    expect(verdict).toEqual({ exit: false, reason: '' });
  });

  it('exits once the vol ratio converges below exitVolRatio', () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // spread 0.01, depth 1 -> IV ≈ 0.873, ratio vs 1.0 reference ≈ 1.146 < 1.15
    const calmBook = makeBook({ spread: 0.01, depth: 1 });
    // @ts-expect-error - call protected method for test
    const verdict = strat.getCustomExitCondition(pos, 0.5, calmBook);
    expect(verdict.exit).toBe(true);
    expect(verdict.reason).toContain('vol-converged');
  });

  it('does not exit while the vol ratio remains above exitVolRatio', () => {
    const strat = new VolatilitySurfaceArbStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // spread 0.5, depth 1 -> IV ≈ 43.6, ratio vs 1.0 reference > 1.15
    const wildBook = makeBook({ spread: 0.5, depth: 1 });
    // @ts-expect-error - call protected method for test
    const verdict = strat.getCustomExitCondition(pos, 0.5, wildBook);
    expect(verdict).toEqual({ exit: false, reason: '' });
  });
});

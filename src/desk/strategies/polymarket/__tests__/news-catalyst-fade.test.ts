/**
 * Tests for news-catalyst-fade — the News Catalyst Fade strategy.
 *
 * Exercises the pure helpers (calcVelocity / detectSpike / calcRetracePrice),
 * DEFAULT_CONFIG, the constructor config merge, scanEntries() entry filtering
 * and spike-driven entries (via a mocked CLOB + orderManager + eventBus +
 * gamma), and getCustomExitCondition() retrace-hit logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GammaMarket } from '../../polymarket/gamma-client';
import { StrategyDeps } from '../base-polymarket-strategy-types';
import {
  DEFAULT_CONFIG,
  calcVelocity,
  detectSpike,
  calcRetracePrice,
  createNewsCatalystFadeTick,
  NewsCatalystFadeStrategy,
} from '../news-catalyst-fade';

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

/** Book whose bestBidAsk mid == `price` (bid=price-0.01, ask=price+0.01). */
function makeBook(price: number) {
  return {
    bids: [{ price: (price - 0.01).toString(), size: '100' }],
    asks: [{ price: (price + 0.01).toString(), size: '100' }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string) => number): StrategyDeps {
  const getBook = (tokenId: string) =>
    makeBook(bookFor ? bookFor(tokenId) : 0.5);
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

describe('news-catalyst-fade::DEFAULT_CONFIG', () => {
  it('exposes the documented fade defaults', () => {
    expect(DEFAULT_CONFIG).toEqual({
      spikePct: 0.04,
      velocityWindow: 3,
      retraceTarget: 0.5,
      minEdge: 0.01,
      minVolume: 2000,
      takeProfitPct: 0.05,
      stopLossPct: 0.03,
      maxHoldMs: 15 * 60_000,
      maxPositions: 3,
      cooldownMs: 180_000,
      positionSize: '15',
    });
  });
});

describe('news-catalyst-fade::calcVelocity', () => {
  it('returns 0 when the series is shorter than window + 1', () => {
    expect(calcVelocity([0.5, 0.5, 0.5], 3)).toBe(0);
  });

  it('computes the signed change over the window', () => {
    // last - (last-window): 0.55 - 0.5 = 0.05
    expect(calcVelocity([0.5, 0.5, 0.5, 0.5, 0.55], 3)).toBeCloseTo(0.05, 5);
  });

  it('returns a negative velocity for a downtick', () => {
    expect(calcVelocity([0.5, 0.5, 0.5, 0.5, 0.45], 3)).toBeCloseTo(-0.05, 5);
  });
});

describe('news-catalyst-fade::detectSpike', () => {
  it('returns null when the series is too short', () => {
    expect(detectSpike([0.5, 0.5, 0.6], 3)).toBeNull();
  });

  it('returns null when the base price is not positive', () => {
    // base price = prices[len-1-window] = prices[0] = 0
    expect(detectSpike([0, 0, 0, 0, 0.1], 3)).toBeNull();
  });

  it('returns null when the move is below spikePct', () => {
    // change 0.01 / base 0.5 = 0.02 < 0.04
    expect(detectSpike([0.5, 0.5, 0.5, 0.5, 0.51], 3, 0.04)).toBeNull();
  });

  it('"no" when price spikes up (fade by betting no)', () => {
    // change 0.05 / base 0.5 = 0.10 > 0.04
    expect(detectSpike([0.5, 0.5, 0.5, 0.5, 0.55], 3, 0.04)).toBe('no');
  });

  it('"yes" when price spikes down (fade by betting yes)', () => {
    expect(detectSpike([0.5, 0.5, 0.5, 0.5, 0.45], 3, 0.04)).toBe('yes');
  });
});

describe('news-catalyst-fade::calcRetracePrice', () => {
  it('raises the target for a "yes" fade (price expected to keep climbing)', () => {
    // entry 0.45, spikeStart 0.5, side yes -> move 0.05 * 0.5 = 0.025 -> 0.475
    expect(calcRetracePrice(0.45, 0.5, 'yes', 0.5)).toBeCloseTo(0.475, 5);
  });

  it('lowers the target for a "no" fade (price expected to keep dropping)', () => {
    // entry 0.55, spikeStart 0.5, side no -> move 0.05 * 0.5 = 0.025 -> 0.525
    expect(calcRetracePrice(0.55, 0.5, 'no', 0.5)).toBeCloseTo(0.525, 5);
  });
});

// ── Factory ───────────────────────────────────────────────────────────────────

describe('news-catalyst-fade::createNewsCatalystFadeTick', () => {
  it('returns a tick function bound to a fresh strategy', () => {
    const tick = createNewsCatalystFadeTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});

// ── Constructor / config merge ────────────────────────────────────────────────

describe('NewsCatalystFadeStrategy config', () => {
  it('merges overrides on top of DEFAULT_CONFIG', () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps(), { spikePct: 0.08 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.spikePct).toBe(0.08);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.velocityWindow).toBe(DEFAULT_CONFIG.velocityWindow);
  });
});

// ── scanEntries: entry filtering ──────────────────────────────────────────────

describe('NewsCatalystFadeStrategy.scanEntries filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips markets with no yesTokenId', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets already holding a position', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
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
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('c-1', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips scanning once at max positions', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
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
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 500 })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips books whose mid is at the boundaries', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps(() => 0.999));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // getOrderBook is called to read the book; mid near 1 is still read but
    // the entry guard `ba.mid >= 1` triggers. placeOrder must not be called.
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter until enough history is accumulated', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]); // length 4 < window+2
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter when there is no spike', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]); // length 4
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]); // pushes 0.5 -> length 5, no spike
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('caps the price history at velocityWindow * 5 entries', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', Array.from({ length: 16 }, () => 0.5));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]); // pushes one -> 17, then spliced to 15
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('yes-1')).toHaveLength(15);
  });

  it('enters a "no" fade when price spikes up', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps(() => 0.55));
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]); // length 4
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]); // pushes 0.55 -> spike up -> fade no
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = (strat.deps.orderManager.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.tokenId).toBe('no-1');
    expect(call.orderType).toBe('GTC');
  });

  it('enters a "yes" fade when price spikes down', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps(() => 0.45));
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]); // length 4
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]); // pushes 0.45 -> spike down -> fade yes
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = (strat.deps.orderManager.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.tokenId).toBe('yes-1');
  });

  it('records the pre-spike price used for exit calculation', async () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps(() => 0.55));
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]); // base for spike = 0.5
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]); // pushes 0.55 -> spike up -> fade no
    // @ts-expect-error - reach into private field (spikePrices keyed by entry tokenId)
    expect(strat.spikePrices.get('no-1')).toBeCloseTo(0.5, 5);
  });

  it('swallows and logs a CLOB error without throwing', async () => {
    const deps = makeDeps();
    (deps.clob.getOrderBook as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('CLOB down'));
    const strat = new NewsCatalystFadeStrategy(deps);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.5, 0.5, 0.5, 0.5]);
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
  });
});

// ── getCustomExitCondition: retrace-hit exits ─────────────────────────────────

describe('NewsCatalystFadeStrategy.getCustomExitCondition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not exit when there is no recorded spike price', () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const verdict = strat.getCustomExitCondition(pos, 0.6);
    expect(verdict).toEqual({ exit: false, reason: '' });
  });

  it('exits a "yes" fade once price climbs back to the retrace target', () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - reach into private field
    strat.spikePrices.set('yes-1', 0.5); // spikeStart 0.5, entry 0.45, side yes
    // retrace = 0.45 + |0.45-0.5|*0.5 = 0.475
    // @ts-expect-error - call protected method for test
    expect(strat.getCustomExitCondition(pos, 0.48)).toEqual({ exit: true, reason: 'retrace-hit' });
  });

  it('does not exit a "yes" fade until the retrace target is reached', () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.45, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - reach into private field
    strat.spikePrices.set('yes-1', 0.5); // retrace target 0.475
    // @ts-expect-error - call protected method for test
    expect(strat.getCustomExitCondition(pos, 0.46)).toEqual({ exit: false, reason: '' });
  });

  it('exits a "no" fade once price drops back to the retrace target', () => {
    const strat = new NewsCatalystFadeStrategy(makeDeps());
    const pos = { tokenId: 'no-1', conditionId: 'c-1', side: 'no' as const, entryPrice: 0.55, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - reach into private field
    strat.spikePrices.set('no-1', 0.5); // spikeStart 0.5, entry 0.55, side no
    // retrace = 0.55 - |0.55-0.5|*0.5 = 0.525
    // @ts-expect-error - call protected method for test
    expect(strat.getCustomExitCondition(pos, 0.52)).toEqual({ exit: true, reason: 'retrace-hit' });
  });
});

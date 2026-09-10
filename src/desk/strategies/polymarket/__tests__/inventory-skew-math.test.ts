/**
 * inventory-skew-math — Unit Tests
 *
 * Pure math helpers split from inventory-skew-rebalancer.ts (S16 tranche 3).
 * No mocks needed — these are pure functions over TrackedPosition values.
 */
import { describe, it, expect } from 'vitest';
import {
  calcSkew,
  calcConcentration,
  shouldRebalance,
  unrealizedPnl,
} from '../inventory-skew-math';
import type { TrackedPosition } from '../inventory-skew-types';

function pos(overrides: Partial<TrackedPosition> = {}): TrackedPosition {
  return {
    tokenId: 'BTC',
    side: 'yes',
    size: 10,
    entryPrice: 50000,
    currentPrice: 50000,
    marketId: 'm1',
    ...overrides,
  };
}

describe('calcSkew', () => {
  it('returns 0 when positions is empty', () => {
    expect(calcSkew([])).toBe(0);
  });

  it('returns 0 when total exposure is 0 (all zero prices)', () => {
    expect(calcSkew([pos({ currentPrice: 0 }), pos({ side: 'no', currentPrice: 0 })])).toBe(0);
  });

  it('returns +1 when only yes exposure exists', () => {
    const p = pos({ size: 1, currentPrice: 100 });
    expect(calcSkew([p])).toBeCloseTo(1, 10);
  });

  it('returns -1 when only no exposure exists', () => {
    const p = pos({ side: 'no', size: 1, currentPrice: 100 });
    expect(calcSkew([p])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when yes and no exposure are balanced', () => {
    const yes = pos({ side: 'yes', size: 10, currentPrice: 100 });
    const no = pos({ side: 'no', size: 10, currentPrice: 100 });
    expect(calcSkew([yes, no])).toBe(0);
  });

  it('returns positive skew when yes exposure dominates', () => {
    // yes = 1000, no = 100 -> (1000-100)/1100 = 0.8181...
    const yes = pos({ side: 'yes', size: 10, currentPrice: 100 });
    const no = pos({ side: 'no', size: 1, currentPrice: 100 });
    expect(calcSkew([yes, no])).toBeCloseTo(900 / 1100, 10);
  });

  it('returns negative skew when no exposure dominates', () => {
    const yes = pos({ side: 'yes', size: 1, currentPrice: 100 });
    const no = pos({ side: 'no', size: 10, currentPrice: 100 });
    expect(calcSkew([yes, no])).toBeCloseTo(-900 / 1100, 10);
  });

  it('uses size * currentPrice for exposure (not entryPrice)', () => {
    // entryPrice differs from currentPrice; skew must use currentPrice
    const yes = pos({ side: 'yes', size: 10, entryPrice: 1, currentPrice: 100 });
    const no = pos({ side: 'no', size: 10, entryPrice: 1, currentPrice: 100 });
    expect(calcSkew([yes, no])).toBe(0);
  });
});

describe('calcConcentration', () => {
  it('returns 0 when total exposure is 0', () => {
    expect(calcConcentration(pos({ currentPrice: 0 }), [pos({ currentPrice: 0 })])).toBe(0);
  });

  it('returns 1 when the position is the only exposure', () => {
    const p = pos({ size: 5, currentPrice: 100 });
    expect(calcConcentration(p, [p])).toBeCloseTo(1, 10);
  });

  it('returns the fraction of total exposure the position represents', () => {
    // position = 500, total = 500 + 1500 = 2000 -> 0.25
    const target = pos({ size: 5, currentPrice: 100 });
    const other = pos({ side: 'no', size: 15, currentPrice: 100 });
    expect(calcConcentration(target, [target, other])).toBeCloseTo(0.25, 10);
  });

  it('ignores the position itself when computing total (other positions only)', () => {
    // total over ALL positions (including target): target=500, other=500 -> 0.5
    const target = pos({ size: 5, currentPrice: 100 });
    const other = pos({ side: 'no', size: 5, currentPrice: 100 });
    expect(calcConcentration(target, [target, other])).toBeCloseTo(0.5, 10);
  });
});

describe('shouldRebalance', () => {
  it('returns false when within the cooldown interval', () => {
    // now - lastRebalanceAt = 1000ms, interval = 5000ms
    expect(shouldRebalance(0.5, 0.3, Date.now() - 1000, 5000, Date.now())).toBe(false);
  });

  it('returns false when interval elapsed but skew is within threshold', () => {
    expect(shouldRebalance(0.2, 0.3, 0, 1000, 1000)).toBe(false);
  });

  it('returns false when interval elapsed and skew exactly equals threshold', () => {
    expect(shouldRebalance(0.3, 0.3, 0, 1000, 1000)).toBe(false);
  });

  it('returns true when interval elapsed and skew exceeds threshold', () => {
    expect(shouldRebalance(0.5, 0.3, 0, 1000, 1000)).toBe(true);
  });

  it('returns true for negative skew exceeding threshold in magnitude', () => {
    expect(shouldRebalance(-0.5, 0.3, 0, 1000, 1000)).toBe(true);
  });

  it('returns true when interval exactly elapsed and skew exceeds threshold', () => {
    expect(shouldRebalance(0.5, 0.3, 0, 1000, 1000)).toBe(true);
  });
});

describe('unrealizedPnl', () => {
  it('returns positive PnL when current price is above entry', () => {
    // size 10 * (55000 - 50000) = 50000
    expect(unrealizedPnl(pos({ size: 10, entryPrice: 50000, currentPrice: 55000 }))).toBe(50000);
  });

  it('returns negative PnL when current price is below entry', () => {
    expect(unrealizedPnl(pos({ size: 10, entryPrice: 50000, currentPrice: 45000 }))).toBe(-50000);
  });

  it('returns 0 at break-even', () => {
    expect(unrealizedPnl(pos({ size: 10, entryPrice: 50000, currentPrice: 50000 }))).toBe(0);
  });

  it('scales with position size', () => {
    expect(unrealizedPnl(pos({ size: 100, entryPrice: 50000, currentPrice: 50001 }))).toBe(100);
  });
});
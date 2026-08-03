import { describe, it, expect } from 'vitest';
import {
  computePositionDelta,
  computePortfolioDelta,
  estimateHedgeSize,
  computePositionPnl,
  computePortfolioPnl,
} from '../delta-calculator';

function hp(overrides: Partial<{
  marketId: string;
  side: 'YES' | 'NO';
  currentPrice: number;
  entryPrice: number;
  size: number;
}> = {}): any {
  return {
    marketId: overrides.marketId ?? 'm1',
    side: (overrides.side ?? 'YES') as 'YES' | 'NO',
    currentPrice: overrides.currentPrice ?? 0.6,
    entryPrice: overrides.entryPrice ?? 0.5,
    size: overrides.size ?? 100,
  };
}

describe('delta-calculator::computePositionDelta', () => {
  it('zero delta at price 0.5 for YES', () => {
    const r = computePositionDelta(hp({ currentPrice: 0.5 }));
    expect(r.marketId).toBe('m1');
    expect(r.side).toBe('YES');
    expect(r.delta).toBeCloseTo(0, 5);
  });

  it('positive delta when YES price > 0.5', () => {
    expect(computePositionDelta(hp({ currentPrice: 0.8, size: 100 })).delta).toBeCloseTo(60, 5);
  });

  it('negative delta when YES price < 0.5', () => {
    expect(computePositionDelta(hp({ currentPrice: 0.2, size: 100 })).delta).toBeCloseTo(-60, 5);
  });

  it('NO side inverts price mapping', () => {
    const yes = computePositionDelta(hp({ side: 'YES', currentPrice: 0.8, size: 100 }));
    const no = computePositionDelta(hp({ side: 'NO', currentPrice: 0.8, size: 100 }));
    expect(yes.delta).toBeCloseTo(60, 5);
    expect(no.delta).toBeCloseTo(-60, 5);
    expect(yes.delta).toBeCloseTo(-no.delta, 5);
  });

  it('delta scales linearly with size', () => {
    const s = computePositionDelta(hp({ currentPrice: 0.8, size: 50 }));
    const l = computePositionDelta(hp({ currentPrice: 0.8, size: 200 }));
    expect(l.delta).toBeCloseTo(s.delta * 4, 5);
  });
});

describe('delta-calculator::computePortfolioDelta', () => {
  it('zero netDelta for symmetric YES+NO', () => {
    const positions = [
      hp({ marketId: 'm1', side: 'YES', currentPrice: 0.7, size: 100 }),
      hp({ marketId: 'm2', side: 'NO', currentPrice: 0.7, size: 100 }),
    ];
    const r = computePortfolioDelta(positions, 0.01);
    expect(r.netDelta).toBeCloseTo(0, 5);
  });

  it('netDelta equals sum of individual deltas', () => {
    const positions = [
      hp({ marketId: 'm1', side: 'YES', currentPrice: 0.8, size: 100 }),
      hp({ marketId: 'm2', side: 'YES', currentPrice: 0.6, size: 100 }),
    ];
    const r = computePortfolioDelta(positions, 0.01);
    const sum = positions.reduce((s, p) => s + computePositionDelta(p).delta, 0);
    expect(r.netDelta).toBeCloseTo(sum, 5);
  });

  it('isNeutral true when |netDelta| <= threshold', () => {
    const positions = [
      hp({ marketId: 'm1', side: 'YES', currentPrice: 0.51, size: 10 }),
      hp({ marketId: 'm2', side: 'NO', currentPrice: 0.51, size: 10 }),
    ];
    expect(computePortfolioDelta(positions, 0.01).isNeutral).toBe(true);
  });

  it('isNeutral false when |netDelta| > threshold', () => {
    const positions = [hp({ marketId: 'm1', side: 'YES', currentPrice: 0.9, size: 500 })];
    expect(computePortfolioDelta(positions, 0.01).isNeutral).toBe(false);
  });

  it('returns positionDeltas array matching input length', () => {
    const positions = [hp({ marketId: 'm1' }), hp({ marketId: 'm2' }), hp({ marketId: 'm3' })];
    const r = computePortfolioDelta(positions, 0.01);
    expect(r.positionDeltas).toHaveLength(3);
  });
});

describe('delta-calculator::estimateHedgeSize', () => {
  it('returns 0 when market price exactly 0.5', () => {
    expect(estimateHedgeSize(50, 0.5, 1000)).toBe(0);
  });

  it('caps hedge size at maxSize', () => {
    expect(estimateHedgeSize(100, 0.9, 100)).toBeLessThanOrEqual(100);
  });

  it('smaller hedge when price closer to 0.5', () => {
    const near = estimateHedgeSize(100, 0.55, 99999);
    const far = estimateHedgeSize(100, 0.9, 99999);
    expect(near).toBeGreaterThan(far);
  });

  it('scales linearly with delta amount', () => {
    const h10 = estimateHedgeSize(10, 0.8, 99999);
    const h40 = estimateHedgeSize(40, 0.8, 99999);
    expect(h40).toBeCloseTo(h10 * 4, 5);
  });
});

describe('delta-calculator::computePositionPnl', () => {
  it('YES profit when price rises', () => {
    expect(computePositionPnl(hp({ side: 'YES', entryPrice: 0.4, currentPrice: 0.7, size: 100 }))).toBeCloseTo(30, 5);
  });

  it('YES loss when price falls', () => {
    expect(computePositionPnl(hp({ side: 'YES', entryPrice: 0.7, currentPrice: 0.3, size: 100 }))).toBeCloseTo(-40, 5);
  });

  it('NO profit when price falls', () => {
    expect(computePositionPnl(hp({ side: 'NO', entryPrice: 0.6, currentPrice: 0.2, size: 100 }))).toBeCloseTo(40, 5);
  });

  it('NO loss when price rises', () => {
    expect(computePositionPnl(hp({ side: 'NO', entryPrice: 0.3, currentPrice: 0.8, size: 100 }))).toBeCloseTo(-50, 5);
  });

  it('zero PnL at entry price', () => {
    expect(computePositionPnl(hp({ side: 'YES', entryPrice: 0.5, currentPrice: 0.5, size: 100 }))).toBeCloseTo(0, 5);
  });
});

describe('delta-calculator::computePortfolioPnl', () => {
  it('sum of individual PnLs', () => {
    const positions = [
      hp({ side: 'YES', entryPrice: 0.4, currentPrice: 0.7, size: 100 }),
      hp({ side: 'NO', entryPrice: 0.6, currentPrice: 0.3, size: 50 }),
    ];
    const expected = positions.reduce((s, p) => s + computePositionPnl(p), 0);
    expect(computePortfolioPnl(positions)).toBeCloseTo(expected, 5);
  });

  it('empty array returns 0', () => {
    expect(computePortfolioPnl([])).toBe(0);
  });

  it('all profits yields positive total', () => {
    const positions = [
      hp({ side: 'YES', entryPrice: 0.4, currentPrice: 0.8, size: 100 }),
      hp({ side: 'NO', entryPrice: 0.6, currentPrice: 0.2, size: 100 }),
    ];
    expect(computePortfolioPnl(positions)).toBeGreaterThan(0);
  });
});

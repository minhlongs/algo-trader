import { describe, it, expect } from 'vitest';
import { requiresRebalance, computeRebalanceSignals, applyRebalanceSignals } from '../rebalance-engine';
import type { HedgePosition, DeltaNeutralPortfolio } from '../../../shared/types/delta-neutral-types';

function hp(overrides: Partial<HedgePosition> = {}): HedgePosition {
  return {
    marketId: overrides.marketId ?? 'r1',
    side: overrides.side ?? 'YES',
    size: overrides.size ?? 100,
    entryPrice: overrides.entryPrice ?? 0.5,
    currentPrice: overrides.currentPrice ?? 0.6,
    ...overrides,
  };
}

function portfolio(positions: HedgePosition[], netDelta: number): DeltaNeutralPortfolio {
  const totalExposure = positions.reduce((s, p) => s + p.size, 0);
  return {
    id: 'p1',
    positions,
    netDelta,
    totalExposure,
    unrealizedPnl: 0,
    updatedAt: Date.now(),
  };
}

describe('rebalance-engine::requiresRebalance', () => {
  it('false when |netDelta| <= threshold', () => {
    expect(requiresRebalance(portfolio([hp()], 0.05), 0.1)).toBe(false);
  });

  it('true when netDelta > threshold', () => {
    expect(requiresRebalance(portfolio([hp()], 0.5), 0.1)).toBe(true);
  });

  it('true when netDelta < -threshold', () => {
    expect(requiresRebalance(portfolio([hp()], -0.5), 0.1)).toBe(true);
  });

  it('false at exactly threshold (strict less-than)', () => {
    expect(requiresRebalance(portfolio([hp()], 0.1), 0.1)).toBe(false);
  });

  it('true slightly above threshold', () => {
    expect(requiresRebalance(portfolio([hp()], 0.100001), 0.1)).toBe(true);
  });
});

describe('rebalance-engine::computeRebalanceSignals', () => {
  it('deltaBefore matches input netDelta', () => {
    const p = portfolio([hp({ marketId: 'r1', currentPrice: 0.8, size: 100 })], 60);
    const r = computeRebalanceSignals(p, 10, 100);
    expect(r.deltaBefore).toBeCloseTo(60, 5);
  });

  it('generates rebalance signals when out of threshold', () => {
    const positions = [
      hp({ marketId: 'r1', currentPrice: 0.8, size: 100 }),
      hp({ marketId: 'r2', currentPrice: 0.3, size: 200 }),
    ];
    const p = portfolio(positions, 60);
    const r = computeRebalanceSignals(p, 10, 100);
    expect(r.signals.length).toBeGreaterThanOrEqual(1);
  });

  it('no signals when already within threshold', () => {
    const p = portfolio([hp({ marketId: 'r1', size: 10, currentPrice: 0.5 })], 0.005);
    const r = computeRebalanceSignals(p, 10, 100);
    expect(r.signals).toHaveLength(0);
  });

  it('estimatedCost equals sum of signal sizes', () => {
    const p = portfolio([hp({ marketId: 'r1', currentPrice: 0.8, size: 100 })], 60);
    const r = computeRebalanceSignals(p, 10, 100);
    const sum = r.signals.reduce((s, sig) => s + sig.size, 0);
    expect(r.estimatedCost).toBeCloseTo(sum, 5);
  });

  it('each signal has action, marketId, side, size, reason', () => {
    const p = portfolio([hp({ marketId: 'r1', currentPrice: 0.8, size: 100 })], 60);
    const r = computeRebalanceSignals(p, 10, 100);
    for (const sig of r.signals) {
      expect(['BUY', 'SELL']).toContain(sig.action);
      expect(typeof sig.marketId).toBe('string');
      expect(['YES', 'NO']).toContain(sig.side);
      expect(sig.size).toBeGreaterThan(0);
      expect(typeof sig.reason).toBe('string');
      expect(sig.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('rebalance-engine::applyRebalanceSignals', () => {
  it('BUY signal increases position size', () => {
    const positions = [hp({ marketId: 'r1', size: 100 })];
    const signals = [{ action: 'BUY', marketId: 'r1', side: 'YES', size: 25, reason: '' }];
    const result = applyRebalanceSignals(positions, signals);
    expect(result[0].size).toBeCloseTo(125, 5);
  });

  it('SELL signal decreases position size', () => {
    const positions = [hp({ marketId: 'r1', size: 100 })];
    const signals = [{ action: 'SELL', marketId: 'r1', side: 'YES', size: 30, reason: '' }];
    const result = applyRebalanceSignals(positions, signals);
    expect(result[0].size).toBeCloseTo(70, 5);
  });

  it('SELL does not make size negative', () => {
    const positions = [hp({ marketId: 'r1', size: 10 })];
    const signals = [{ action: 'SELL', marketId: 'r1', side: 'YES', size: 50, reason: '' }];
    const result = applyRebalanceSignals(positions, signals);
    expect(result[0].size).toBeGreaterThanOrEqual(0);
  });

  it('unknown marketId in signal is ignored', () => {
    const positions = [hp({ marketId: 'r1', size: 100 })];
    const signals = [{ action: 'BUY', marketId: 'unknown', side: 'YES', size: 50, reason: '' }];
    const result = applyRebalanceSignals(positions, signals);
    expect(result[0].size).toBeCloseTo(100, 5);
  });

  it('original positions array is not mutated', () => {
    const positions = [hp({ marketId: 'r1', size: 100 })];
    const signals = [{ action: 'BUY', marketId: 'r1', side: 'YES', size: 25, reason: '' }];
    applyRebalanceSignals(positions, signals);
    expect(positions[0].size).toBeCloseTo(100, 5);
  });

  it('returns a new array (not same reference)', () => {
    const positions = [hp({ marketId: 'r1', size: 100 })];
    const signals = [{ action: 'BUY', marketId: 'r1', side: 'YES', size: 25, reason: '' }];
    const result = applyRebalanceSignals(positions, signals);
    expect(result).not.toBe(positions);
  });

  it('signals reference different marketIds get applied independently', () => {
    const positions = [
      hp({ marketId: 'r1', size: 80 }),
      hp({ marketId: 'r2', size: 120, side: 'NO' }),
    ];
    const signals = [
      { action: 'BUY', marketId: 'r1', side: 'YES', size: 20, reason: '' },
      { action: 'SELL', marketId: 'r2', side: 'NO', size: 40, reason: '' },
    ];
    const result = applyRebalanceSignals(positions, signals);
    expect(result[0].size).toBeCloseTo(100, 5);
    expect(result[1].size).toBeCloseTo(80, 5);
  });
});

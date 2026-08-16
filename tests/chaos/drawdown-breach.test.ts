/**
 * Chaos: Drawdown Breach
 * Verifies tiered drawdown protection triggers at correct thresholds.
 *
 * Actual thresholds (TieredDrawdownConfig defaults):
 *  -5%  → ALERT
 *  -10% → REDUCE
 *  -15% → HALT  (haltedUntil blocks further progress until reset)
 *  -20% → HARD_STOP  (requires fresh reset to reach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TieredDrawdownBreaker } from '../../src/desk/risk/tiered-drawdown-breaker';
import type { TieredDrawdownConfig } from '../../src/desk/risk/tiered-drawdown-types';

// Prevent loadFromDisk() from reading stale production state
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

function makeConfig(): TieredDrawdownConfig {
  return {
    alertThreshold: 0.05,
    reduceThreshold: 0.10,
    haltThreshold: 0.15,
    hardStopThreshold: 0.20,
    dailyLossThreshold: 0.03,
    haltDurationMs: 48 * 60 * 60 * 1000,
    dailyPauseDurationMs: 24 * 60 * 60 * 1000,
    alertSizingReduction: 0.25,
    reduceSizingReduction: 0.50,
  };
}

describe('Chaos: Drawdown Breach', () => {
  let breaker: TieredDrawdownBreaker;

  beforeEach(() => {
    // Constructor takes (initialPortfolioValue, config?)
    breaker = new TieredDrawdownBreaker(100_000, makeConfig());
  });

  it('triggers ALERT at -5% drawdown', () => {
    const state = breaker.update(95_000);
    expect(state.tier).toBe('ALERT');
    expect(state.sizingMultiplier).toBeCloseTo(0.75, 5);
  });

  it('triggers REDUCE at -10% drawdown', () => {
    const state = breaker.update(90_000);
    expect(state.tier).toBe('REDUCE');
    expect(state.sizingMultiplier).toBeCloseTo(0.5, 5);
  });

  it('triggers HARD_STOP at -20% when starting fresh', () => {
    const fresh = new TieredDrawdownBreaker(100_000, makeConfig());
    const state = fresh.update(80_000);
    expect(state.tier).toBe('HARD_STOP');
    expect(state.sizingMultiplier).toBeCloseTo(0, 5);
  });

  it('halts trading at HALT/HARD_STOP tiers', () => {
    breaker.update(85_000);
    const state = breaker.getState();
    expect(['HALT', 'HARD_STOP']).toContain(state.tier);
  });

  it('moves through tiers with reset between HALT and HARD_STOP', () => {
    breaker.update(95_000);
    expect(breaker.getState().tier).toBe('ALERT');

    breaker.update(90_000);
    expect(breaker.getState().tier).toBe('REDUCE');

    breaker.update(85_000);
    expect(breaker.getState().tier).toBe('HALT');

    // Reset to simulate recovery (breaks haltedUntil timer)
    breaker.reset(100_000);
    breaker.update(80_000);
    expect(breaker.getState().tier).toBe('HARD_STOP');
  });
});
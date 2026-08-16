/**
 * RegimeAwareKelly — Unit tests
 */

import { describe, it, expect, vi } from 'vitest';
import { RegimeAwareKelly, type RegimeAwareKellyConfig } from '../regime-aware-kelly';

const BASE_INPUT = {
  winProbability: 0.55,
  winLossRatio: 2.0,
  portfolioValue: 100_000,
};

describe('RegimeAwareKelly', () => {
  const defaultConfig: RegimeAwareKellyConfig = {
    kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05, minPositionUsd: 1, isManagedCapital: true },
    regimeMultipliers: {},
    unknownRegimeMultiplier: 0.75,
  };

  function make(config: RegimeAwareKellyConfig = defaultConfig) {
    return new RegimeAwareKelly(config);
  }

  describe('size()', () => {
    it('returns zero for SHOCK regime (multiplier 0)', () => {
      const k = make();
      const result = k.size(BASE_INPUT, 'SHOCK');
      expect(result.positionSizeUsd).toBe(0);
      expect(result.fractionUsed).toBe(0);
    });

    it('increases size for TREND_UP (multiplier 1.25)', () => {
      const k = make();
      const base = k.size(BASE_INPUT, 'UNKNOWN');
      const trendUp = k.size(BASE_INPUT, 'TREND_UP');
      expect(trendUp.positionSizeUsd).toBeGreaterThan(base.positionSizeUsd);
      expect(trendUp.fractionUsed).toBeGreaterThan(base.fractionUsed);
    });

    it('decreases size for TREND_DOWN (multiplier 0.5)', () => {
      const k = make();
      const base = k.size(BASE_INPUT, 'RANGE');
      const trendDown = k.size(BASE_INPUT, 'TREND_DOWN');
      expect(trendDown.positionSizeUsd).toBeLessThan(base.positionSizeUsd);
    });

    it('decreases size for HIGH_VOLATILITY (multiplier 0.5)', () => {
      const k = make();
      const base = k.size(BASE_INPUT, 'LOW_VOLATILITY');
      const highVol = k.size(BASE_INPUT, 'HIGH_VOLATILITY');
      expect(highVol.positionSizeUsd).toBeLessThan(base.positionSizeUsd);
    });

    it('falls back to unknownRegimeMultiplier for UNKNOWN', () => {
      const k = make({ ...defaultConfig, unknownRegimeMultiplier: 0.30 });
      const result = k.size(BASE_INPUT, 'UNKNOWN');
      const base = k.size(BASE_INPUT, 'RANGE');
      expect(result.fractionUsed).toBeCloseTo(base.fractionUsed * 0.30, 2);
    });

    it('respects custom regimeMultipliers', () => {
      const k = make({
        ...defaultConfig,
        regimeMultipliers: { TREND_UP: 2.0, SHOCK: 0.1 },
      });
      const trendUp = k.size(BASE_INPUT, 'TREND_UP');
      const shock = k.size(BASE_INPUT, 'SHOCK');
      expect(trendUp.positionSizeUsd).toBeGreaterThan(0);
      expect(shock.positionSizeUsd).toBeGreaterThan(0); // 0.1 multiplier, not 0
    });
  });
});
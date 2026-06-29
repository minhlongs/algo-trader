/**
 * Kelly Position Sizer Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KellyPositionSizer } from '../kelly-position-sizer';

describe('KellyPositionSizer', () => {
  beforeEach(() => {
    delete process.env.KELLY_FRACTION;
  });

  describe('constructor defaults', () => {
    it('should default to quarter-Kelly (0.25)', () => {
      const sizer = new KellyPositionSizer();
      expect(sizer.getConfig().kellyFraction).toBe(0.25);
    });

    it('should default maxPositionFraction to 5%', () => {
      const sizer = new KellyPositionSizer();
      expect(sizer.getConfig().maxPositionFraction).toBe(0.05);
    });

    it('should read KELLY_FRACTION from env', () => {
      process.env.KELLY_FRACTION = '0.4';
      const sizer = new KellyPositionSizer();
      expect(sizer.getConfig().kellyFraction).toBe(0.4);
    });

    it('should clamp fraction to 0.1-0.5 range', () => {
      const low = new KellyPositionSizer({ kellyFraction: 0.01 });
      expect(low.getConfig().kellyFraction).toBe(0.1);

      const high = new KellyPositionSizer({ kellyFraction: 0.9 });
      expect(high.getConfig().kellyFraction).toBe(0.5);
    });
  });

  describe('managed capital cap', () => {
    it('should cap managed capital at 0.25 even if config says 0.5', () => {
      const sizer = new KellyPositionSizer({
        kellyFraction: 0.5,
        isManagedCapital: true,
      });
      expect(sizer.getConfig().kellyFraction).toBe(0.25);
    });

    it('should allow own-account to use 0.5', () => {
      const sizer = new KellyPositionSizer({
        kellyFraction: 0.5,
        isManagedCapital: false,
      });
      expect(sizer.getConfig().kellyFraction).toBe(0.5);
    });

    it('should cap managed capital even from env override', () => {
      process.env.KELLY_FRACTION = '0.5';
      const sizer = new KellyPositionSizer({ isManagedCapital: true });
      expect(sizer.getConfig().kellyFraction).toBe(0.25);
    });

    it('should produce smaller positions for managed vs own-account', () => {
      const managed = new KellyPositionSizer({
        kellyFraction: 0.5,
        isManagedCapital: true,
        maxPositionFraction: 1.0, // uncap for comparison
      });
      const own = new KellyPositionSizer({
        kellyFraction: 0.5,
        isManagedCapital: false,
        maxPositionFraction: 1.0,
      });
      const input = { winProbability: 0.6, winLossRatio: 1.5, portfolioValue: 100000 };
      const mResult = managed.calculatePositionSize(input);
      const oResult = own.calculatePositionSize(input);
      // Managed capped at 0.25 vs own at 0.5 → managed ≤ half of own
      expect(mResult.positionSizeUsd).toBeLessThanOrEqual(oResult.positionSizeUsd);
      expect(mResult.fractionUsed).toBe(0.25);
      expect(oResult.fractionUsed).toBe(0.5);
    });
  });

  describe('Kelly formula', () => {
    it('should return 0 for negative edge (no bet)', () => {
      const sizer = new KellyPositionSizer();
      const result = sizer.calculatePositionSize({
        winProbability: 0.3,
        winLossRatio: 1.0,
        portfolioValue: 100000,
      });
      // Kelly = (1*0.3 - 0.7)/1 = -0.4 → no bet
      expect(result.positionSizeUsd).toBe(0);
      expect(result.kellyRaw).toBeLessThanOrEqual(0);
    });

    it('should size correctly for a 60% win, 1.5:1 edge', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25 });
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 1.5,
        portfolioValue: 100000,
      });
      // Kelly raw = (1.5*0.6 - 0.4)/1.5 = 0.333
      // Adjusted = 0.333 * 0.25 = 0.083
      // Capped at 5% = $5000
      expect(result.kellyRaw).toBeCloseTo(0.333, 2);
      expect(result.positionSizeUsd).toBe(5000); // capped at 5%
      expect(result.cappedByMax).toBe(true);
    });

    it('should not cap when position is under max', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.1 });
      const result = sizer.calculatePositionSize({
        winProbability: 0.55,
        winLossRatio: 1.2,
        portfolioValue: 100000,
      });
      // Kelly raw = (1.2*0.55 - 0.45)/1.2 = 0.175
      // Adjusted = 0.175 * 0.1 = 0.0175 = 1.75% < 5% max
      expect(result.cappedByMax).toBe(false);
      expect(result.portfolioPercent).toBeLessThan(5);
    });

    it('should return 0 for invalid inputs', () => {
      const sizer = new KellyPositionSizer();
      expect(sizer.calculatePositionSize({ winProbability: 0, winLossRatio: 1.5, portfolioValue: 100000 }).positionSizeUsd).toBe(0);
      expect(sizer.calculatePositionSize({ winProbability: 1, winLossRatio: 1.5, portfolioValue: 100000 }).positionSizeUsd).toBe(0);
      expect(sizer.calculatePositionSize({ winProbability: 0.6, winLossRatio: 0, portfolioValue: 100000 }).positionSizeUsd).toBe(0);
      expect(sizer.calculatePositionSize({ winProbability: 0.6, winLossRatio: 1.5, portfolioValue: 0 }).positionSizeUsd).toBe(0);
    });

    it('should return 0 when position too small (below minPositionUsd)', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.1, minPositionUsd: 100 });
      const result = sizer.calculatePositionSize({
        winProbability: 0.51,
        winLossRatio: 1.01,
        portfolioValue: 100, // tiny portfolio
      });
      expect(result.positionSizeUsd).toBe(0);
    });
  });

  describe('half-Kelly vs quarter-Kelly comparison', () => {
    it('half-Kelly should produce ~2x position vs quarter-Kelly', () => {
      const quarter = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 1.0 });
      const half = new KellyPositionSizer({ kellyFraction: 0.5, maxPositionFraction: 1.0 });

      const input = { winProbability: 0.6, winLossRatio: 1.5, portfolioValue: 100000 };
      const qResult = quarter.calculatePositionSize(input);
      const hResult = half.calculatePositionSize(input);

      // Half-Kelly should be exactly 2x quarter-Kelly (both uncapped)
      expect(hResult.kellyAdjusted).toBeCloseTo(qResult.kellyAdjusted * 2, 4);
    });
  });
});

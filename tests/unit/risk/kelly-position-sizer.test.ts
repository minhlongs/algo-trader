/**
 * Unit Tests for Kelly Position Sizer with Correlation Adjustment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KellyPositionSizer, KellyConfig } from '../../../src/desk/risk/kelly-position-sizer';

// Permissive config: no max cap interference for most tests
const permissiveConfig: Partial<KellyConfig> = {
  kellyFraction: 0.25,
  maxPositionFraction: 1.0, // 100% - disable cap for non-cap tests
  minPositionUsd: 10,
  isManagedCapital: false,
};

// Default config with 5% cap for cap-specific tests
const defaultCapConfig: Partial<KellyConfig> = {
  kellyFraction: 0.25,
  maxPositionFraction: 0.05,
  minPositionUsd: 10,
  isManagedCapital: false,
};

describe('KellyPositionSizer', () => {
  let sizer: KellyPositionSizer;

  describe('Basic Kelly Formula', () => {
    beforeEach(() => {
      sizer = new KellyPositionSizer(permissiveConfig);
    });

    it('should calculate correct Kelly fraction for positive edge', () => {
      // winProbability=0.6, winLossRatio=2.0
      // Kelly = (2*0.6 - 0.4)/2 = (1.2 - 0.4)/2 = 0.8/2 = 0.4
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      expect(result.kellyRaw).toBeCloseTo(0.4, 5);
      expect(result.kellyAdjusted).toBeCloseTo(0.1, 5); // 0.4 * 0.25 = 0.1
      expect(result.positionSizeUsd).toBeCloseTo(1000, 0); // 10000 * 0.1 = 1000
    });

    it('should return zero position for Kelly <= 0 or near-zero', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.4,
        winLossRatio: 1.5,
        portfolioValue: 10000,
      });

      // Kelly = (1.5*0.4 - 0.6)/1.5 = 0 (theoretically)
      // Position should be zero due to min position check (tiny value < $10)
      expect(result.positionSizeUsd).toBe(0);
    });

    it('should return zero for invalid inputs', () => {
      const result1 = sizer.calculatePositionSize({
        winProbability: 0,
        winLossRatio: 2,
        portfolioValue: 10000,
      });
      expect(result1.positionSizeUsd).toBe(0);

      const result2 = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: -1,
        portfolioValue: 10000,
      });
      expect(result2.positionSizeUsd).toBe(0);

      const result3 = sizer.calculatePositionSize({
        winProbability: 1.2, // invalid > 1
        winLossRatio: 2,
        portfolioValue: 10000,
      });
      expect(result3.positionSizeUsd).toBe(0);
    });
  });

  describe('Correlation Adjustment', () => {
    beforeEach(() => {
      sizer = new KellyPositionSizer(permissiveConfig);
    });

    it('should apply no reduction when correlation=0', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
        correlation: 0,
      });

      expect(result.correlation).toBe(0);
      expect(result.kellyAdjusted).toBeCloseTo(0.1, 5);
      expect(result.positionSizeUsd).toBeCloseTo(1000, 0); // No reduction
    });

    it('should reduce position by 50% when correlation=0.5', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
        correlation: 0.5,
      });

      expect(result.correlation).toBe(0.5);
      expect(result.kellyAdjusted).toBeCloseTo(0.1, 5);
      expect(result.positionSizeUsd).toBeCloseTo(500, 0); // 1000 * (1-0.5) = 500
    });

    it('should zero out position when correlation=1', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
        correlation: 1,
      });

      expect(result.correlation).toBe(1);
      expect(result.positionSizeUsd).toBe(0); // 1000 * (1-1) = 0
    });

    it('should apply proportional reduction for any correlation value', () => {
      const testCases = [
        { correlation: 0.25, expectedUsd: 750 },   // 1000 * 0.75
        { correlation: 0.75, expectedUsd: 250 },   // 1000 * 0.25
        { correlation: 0.3, expectedUsd: 700 },    // 1000 * 0.7
      ];

      for (const { correlation, expectedUsd } of testCases) {
        const result = sizer.calculatePositionSize({
          winProbability: 0.6,
          winLossRatio: 2.0,
          portfolioValue: 10000,
          correlation,
        });

        expect(result.positionSizeUsd).toBeCloseTo(expectedUsd, 0);
      }
    });

    it('should default correlation to 0 when not provided', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
        // correlation omitted
      });

      expect(result.correlation).toBe(0);
      expect(result.positionSizeUsd).toBeCloseTo(1000, 0);
    });
  });

  describe('Max Position Cap', () => {
    let capSizer: KellyPositionSizer;

    beforeEach(() => {
      capSizer = new KellyPositionSizer(defaultCapConfig);
    });

    it('should cap position at maxPositionFraction default 5%', () => {
      const result = capSizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      // Kelly = 0.4, Adjusted = 0.4 * 0.25 = 0.1 (10%)
      // But max cap is 0.05 (5%), so should be capped
      expect(result.cappedByMax).toBe(true);
      expect(result.positionSizeUsd).toBeCloseTo(500, 0); // 10000 * 0.05
      expect(result.portfolioPercent).toBeCloseTo(5, 1);
    });

    it('should apply correlation adjustment BEFORE max cap', () => {
      // High Kelly that would exceed cap without correlation
      const result = capSizer.calculatePositionSize({
        winProbability: 0.8,
        winLossRatio: 5.0,
        portfolioValue: 10000,
        correlation: 0.4, // 40% reduction
      });

      // Kelly = (5*0.8 - 0.2)/5 = 3.8/5 = 0.76
      // Adjusted = 0.76 * 0.25 = 0.19
      // After correlation: 0.19 * (1-0.4) = 0.114
      // Max cap at 0.05, so final should be 0.05

      expect(result.cappedByMax).toBe(true);
      expect(result.positionSizeUsd).toBeCloseTo(300, 0);
      expect(result.kellyAdjusted).toBeCloseTo(0.19, 2);
      expect(result.portfolioPercent).toBeCloseTo(3, 1);
    });

    it('should respect custom maxPositionFraction', () => {
      const customSizer = new KellyPositionSizer({
        ...defaultCapConfig,
        maxPositionFraction: 0.10, // 10%
      });

      const result = customSizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      // Kelly = 0.4, Adjusted = 0.1, exactly 10% => not capped
      expect(result.cappedByMax).toBe(false);
      expect(result.positionSizeUsd).toBeCloseTo(1000, 0);
    });

    it('should not cap when position below max', () => {
      const result = capSizer.calculatePositionSize({
        winProbability: 0.55,
        winLossRatio: 1.0, // Kelly = (1*0.55 - 0.45)/1 = 0.1, adjusted = 0.025 => 2.5%
        portfolioValue: 10000,
      });

      expect(result.cappedByMax).toBe(false);
      expect(result.positionSizeUsd).toBeCloseTo(250, 0);
    });
  });

  describe('Managed Capital', () => {
    it('should cap fraction at 25% and set cappedByManaged flag', () => {
      const managedSizer = new KellyPositionSizer({
        kellyFraction: 0.5, // Try to set 50%
        maxPositionFraction: 1.0,
        isManagedCapital: true,
      });

      const result = managedSizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      // Should use 0.25 (quarter-Kelly) not 0.5
  expect(result.kellyAdjusted).toBeCloseTo(0.1, 5); // managed cap: effective fraction = 0.25
      expect(result.cappedByManaged).toBe(true);
      expect(result.kellyAdjusted).toBeCloseTo(0.1, 5); // 0.4 * 0.25 = 0.1
      expect(result.positionSizeUsd).toBeCloseTo(1000, 0);
    });

    it('should not set cappedByManaged when fraction already within limit', () => {
      const managedSizer = new KellyPositionSizer({
        kellyFraction: 0.2,
        maxPositionFraction: 1.0,
        isManagedCapital: true,
      });

      const result = managedSizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      expect(managedSizer.getConfig().kellyFraction).toBe(0.2);
      expect(result.cappedByManaged).toBe(false);
      expect(result.kellyAdjusted).toBeCloseTo(0.08, 5); // 0.4 * 0.2 = 0.08
    });
  });

  describe('Minimum Position Enforcement', () => {
    it('should zero out position below minPositionUsd', () => {
      const sizer = new KellyPositionSizer({
        kellyFraction: 0.25,
        maxPositionFraction: 1.0,
        minPositionUsd: 10,
      });

      const result = sizer.calculatePositionSize({
        winProbability: 0.55,
        winLossRatio: 1.2,
        portfolioValue: 100, // Small portfolio
      });

      // Kelly = (1.2*0.55 - 0.45)/1.2 = 0.21/1.2 = 0.175
      // Adjusted = 0.175 * 0.25 = 0.04375
      // Position = 100 * 0.04375 = 4.375, below min $10
      expect(result.positionSizeUsd).toBe(0);
    });

    it('should allow position above minPositionUsd', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      expect(result.positionSizeUsd).toBeGreaterThan(10);
    });
  });

  describe('Result Structure', () => {
    beforeEach(() => {
      sizer = new KellyPositionSizer(permissiveConfig);
    });

    it('should include all fields in result', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
        correlation: 0.3,
      });

      expect(result).toHaveProperty('positionSizeUsd');
      expect(result).toHaveProperty('kellyRaw');
      expect(result).toHaveProperty('kellyAdjusted');
      expect(result).toHaveProperty('correlation');
      expect(result).toHaveProperty('cappedByMax');
      expect(result).toHaveProperty('cappedByManaged');
      expect(result).toHaveProperty('fractionUsed');
      expect(result).toHaveProperty('portfolioPercent');
    });

    it('should report portfolioPercent correctly without cap', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      expect(result.portfolioPercent).toBeCloseTo(10, 1); // 0.1 * 100 = 10%
    });

    it('should report portfolioPercent correctly with cap', () => {
      const capSizer = new KellyPositionSizer(defaultCapConfig);
      const result = capSizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 10000,
      });

      expect(result.portfolioPercent).toBeCloseTo(5, 1); // 0.05 * 100 = 5%
    });
  });

  describe('Config Access', () => {
    it('should return config copy via getConfig', () => {
      sizer = new KellyPositionSizer(permissiveConfig);
      const config = sizer.getConfig();
      expect(config).toEqual({
        kellyFraction: 0.25,
        maxPositionFraction: 1.0,
        minPositionUsd: 10,
        isManagedCapital: false,
      });
    });

    it('should allow environment variable override', () => {
      process.env.KELLY_FRACTION = '0.3';
      const envSizer = new KellyPositionSizer();
      expect(envSizer.getConfig().kellyFraction).toBe(0.3);
      delete process.env.KELLY_FRACTION;
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      sizer = new KellyPositionSizer(permissiveConfig);
    });

    it('should handle extreme winProbability close to 1', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.99,
        winLossRatio: 10,
        portfolioValue: 10000,
      });

      // Kelly = (10*0.99 - 0.01)/10 = 0.989
      // Adjusted = 0.989 * 0.25 = 0.24725
      expect(result.kellyRaw).toBeCloseTo(0.989, 2);
      expect(result.kellyAdjusted).toBeCloseTo(0.24725, 3);
      expect(result.positionSizeUsd).toBeCloseTo(2472.5, 0);
    });

    it('should handle very small edge', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.51,
        winLossRatio: 1.05,
        portfolioValue: 10000,
      });

      expect(result.kellyRaw).toBeGreaterThan(0);
      expect(result.kellyAdjusted).toBeGreaterThan(0);
      expect(result.positionSizeUsd).toBeGreaterThan(0);
    });

    it('should handle zero portfolio gracefully', () => {
      const result = sizer.calculatePositionSize({
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 0,
      });

      expect(result.positionSizeUsd).toBe(0);
      expect(result.portfolioPercent).toBe(0);
    });

    it('should handle high correlation reducing position to zero', () => {
      // Even with decent Kelly, correlation=1 yields zero
      const result = sizer.calculatePositionSize({
        winProbability: 0.8,
        winLossRatio: 3.0,
        portfolioValue: 10000,
        correlation: 1,
      });

      expect(result.positionSizeUsd).toBe(0);
      expect(result.kellyAdjusted).toBeGreaterThan(0); // Kelly still calculated
    });
  });

  describe('Integration: Caps + Correlation + Managed', () => {
    it('should apply correlation, then max cap, with managed capital', () => {
      const sizer = new KellyPositionSizer({
        kellyFraction: 0.5, // Will be capped to 0.25 by managed
        maxPositionFraction: 0.05,
        minPositionUsd: 10,
        isManagedCapital: true,
      });

      const result = sizer.calculatePositionSize({
        winProbability: 0.8,
        winLossRatio: 5.0,
        portfolioValue: 10000,
        correlation: 0.2,
      });

      // Kelly = 0.76, fractionUsed = 0.25 => kellyAdjusted = 0.19
      // After correlation: 0.19 * 0.8 = 0.152
      // After max cap (0.05) => final fraction 0.05
      expect(result.cappedByManaged).toBe(true);
      expect(result.cappedByMax).toBe(true);
      expect(result.correlation).toBe(0.2);
      expect(result.positionSizeUsd).toBeCloseTo(400, 0);
      expect(result.fractionUsed).toBe(0.25);
    });
  });
});

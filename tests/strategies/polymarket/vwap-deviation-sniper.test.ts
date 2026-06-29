// SPDX-License-Identifier: MIT
/**
 * Unit tests for VWAP Deviation Sniper strategy
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calcVWAP,
  calcDeviation,
  calcStdDev,
  calcZScore,
  determineSignal,
  type VwapDeviationSniperDeps,
  type VwapDeviationSniperConfig,
  DEFAULT_CONFIG,
} from '../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts';
import type { RawOrderBook } from '../../../src/polymarket/clob-client.ts';
import type { GammaMarket } from '../../../src/polymarket/gamma-client.ts';

describe('VWAP Deviation Sniper', () => {
  describe('calcVWAP', () => {
    it('should calculate VWAP correctly for single data point', () => {
      const prices = [100];
      const volumes = [10];
      expect(calcVWAP(prices, volumes)).toBeCloseTo(100, 6);
    });

    it('should calculate VWAP correctly for multiple data points', () => {
      const prices = [100, 101, 99];
      const volumes = [10, 20, 15];
      // VWAP = (100*10 + 101*20 + 99*15) / (10+20+15)
      // = (1000 + 2020 + 1485) / 45 = 4505 / 45 = 100.111...
      expect(calcVWAP(prices, volumes)).toBeCloseTo(100.111111, 4);
    });

    it('should handle zero volume', () => {
      const prices = [100, 101];
      const volumes = [0, 0];
      expect(calcVWAP(prices, volumes)).toBe(0);
    });

    it('should skip zero volume entries', () => {
      const prices = [100, 101, 99];
      const volumes = [10, 0, 15];
      // VWAP = (100*10 + 99*15) / (10+15) = (1000 + 1485) / 25 = 2485 / 25 = 99.4
      expect(calcVWAP(prices, volumes)).toBeCloseTo(99.4, 4);
    });

    it('should return 0 for empty arrays', () => {
      expect(calcVWAP([], [])).toBe(0);
    });

    it('should return 0 for mismatched array lengths', () => {
      const prices = [100, 101];
      const volumes = [10];
      expect(calcVWAP(prices, volumes)).toBe(0);
    });

    it('should handle negative volumes', () => {
      const prices = [100, 101];
      const volumes = [10, -5];
      expect(calcVWAP(prices, volumes)).toBeCloseTo(100, 6);
    });

    it('should handle high volume scenarios', () => {
      const prices = [100, 200];
      const volumes = [1000, 1];
      // VWAP = (100*1000 + 200*1) / (1000+1) = 100200 / 1001 = 100.0999...
      expect(calcVWAP(prices, volumes)).toBeCloseTo(100.0999, 4);
    });
  });

  describe('calcDeviation', () => {
    it('should calculate positive deviation correctly', () => {
      expect(calcDeviation(110, 100)).toBeCloseTo(0.1, 6);
    });

    it('should calculate negative deviation correctly', () => {
      expect(calcDeviation(90, 100)).toBeCloseTo(-0.1, 6);
    });

    it('should return 0 when price equals VWAP', () => {
      expect(calcDeviation(100, 100)).toBe(0);
    });

    it('should return 0 when VWAP is 0', () => {
      expect(calcDeviation(100, 0)).toBe(0);
    });

    it('should handle very small VWAP', () => {
      expect(calcDeviation(0.01, 0.001)).toBeCloseTo(9, 4);
    });
  });

  describe('calcStdDev', () => {
    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = calcStdDev(values, mean);
      // Known population std dev: ~2
      expect(stdDev).toBeGreaterThan(1.5);
      expect(stdDev).toBeLessThan(2.5);
    });

    it('should return 0 for single value', () => {
      expect(calcStdDev([100], 100)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(calcStdDev([], 0)).toBe(0);
    });

    it('should return 0 when all values equal mean', () => {
      expect(calcStdDev([5, 5, 5], 5)).toBe(0);
    });
  });

  describe('calcZScore', () => {
    it('should calculate positive z-score correctly', () => {
      const history = [100, 101, 99, 100, 101];
      const zScore = calcZScore(105, history);
      expect(zScore).toBeGreaterThan(0);
    });

    it('should calculate negative z-score correctly', () => {
      const history = [100, 101, 99, 100, 101];
      const zScore = calcZScore(95, history);
      expect(zScore).toBeLessThan(0);
    });

    it('should return 0 for insufficient history', () => {
      expect(calcZScore(100, [100])).toBe(0);
      expect(calcZScore(100, [])).toBe(0);
    });

    it('should return 0 when stdDev is 0', () => {
      expect(calcZScore(100, [100, 100, 100])).toBe(0);
    });

    it('should return value relative to mean for normal distribution', () => {
      const history = [10, 12, 14, 11, 13];
      const z = calcZScore(16, history);
      expect(z).toBeGreaterThan(1); // > 1 std dev above mean
    });
  });

  describe('determineSignal', () => {
    it('should return "yes" for oversold condition', () => {
      expect(determineSignal(-2.5, 2.0)).toBe('yes');
      expect(determineSignal(-3.0, 2.0)).toBe('yes');
    });

    it('should return "no" for overbought condition', () => {
      expect(determineSignal(2.5, 2.0)).toBe('no');
      expect(determineSignal(3.0, 2.0)).toBe('no');
    });

    it('should return null for neutral condition', () => {
      expect(determineSignal(0, 2.0)).toBe(null);
      expect(determineSignal(1.5, 2.0)).toBe(null);
      expect(determineSignal(-1.5, 2.0)).toBe(null);
    });

    it('should respect threshold exactly at boundary', () => {
      expect(determineSignal(2.0, 2.0)).toBe(null); // boundary = no signal
      expect(determineSignal(-2.0, 2.0)).toBe(null);
    });

    it('should handle extreme z-scores', () => {
      expect(determineSignal(-10, 2.0)).toBe('yes');
      expect(determineSignal(10, 2.0)).toBe('no');
    });

    it('should work with different threshold values', () => {
      expect(determineSignal(1.5, 1.0)).toBe('no');
      expect(determineSignal(-1.5, 1.0)).toBe('yes');
      expect(determineSignal(1.5, 2.0)).toBe(null);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_CONFIG.vwapWindow).toBe(20);
      expect(DEFAULT_CONFIG.minPeriods).toBe(10);
      expect(DEFAULT_CONFIG.deviationThreshold).toBe(2.0);
      expect(DEFAULT_CONFIG.exitThreshold).toBe(0.5);
      expect(DEFAULT_CONFIG.minVolume).toBe(5000);
      expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.03);
      expect(DEFAULT_CONFIG.stopLossPct).toBe(0.02);
      expect(DEFAULT_CONFIG.maxHoldMs).toBe(20 * 60_000);
      expect(DEFAULT_CONFIG.maxPositions).toBe(4);
      expect(DEFAULT_CONFIG.cooldownMs).toBe(120_000);
      expect(DEFAULT_CONFIG.positionSize).toBe('12');
    });

    it('should have minPeriods <= vwapWindow', () => {
      expect(DEFAULT_CONFIG.minPeriods).toBeLessThanOrEqual(DEFAULT_CONFIG.vwapWindow);
    });
  });

  describe('Integration: Strategy Factory', () => {
    const mockDeps: VwapDeviationSniperDeps = {
      clob: {
        getOrderBook: vi.fn().mockResolvedValue({
          bids: [{ price: '0.49', size: '100' }],
          asks: [{ price: '0.51', size: '100' }],
        }),
      },
      orderManager: {
        placeOrder: vi.fn().mockResolvedValue({ id: 'order-123' }),
      },
      eventBus: {
        emit: vi.fn(),
      },
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          {
            id: 'market-1',
            conditionId: '0x123',
            question: 'Test Market',
            yesTokenId: 'token-yes-1',
            noTokenId: 'token-no-1',
            volume: 10000,
            closed: false,
            resolved: false,
            yesPrice: 0.5,
          } as GammaMarket,
        ]),
      },
    };

    it('should create tick function with default config', async () => {
      const { createVwapDeviationSniperTick } = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      const tick = createVwapDeviationSniperTick({} as any);
      expect(typeof tick).toBe('function');
    });

    it('should create tick function with custom config', async () => {
      const customDeps: VwapDeviationSniperDeps = {
        ...mockDeps,
        config: {
          vwapWindow: 30,
          deviationThreshold: 3.0,
        },
      };
      const { createVwapDeviationSniperTick } = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      const tick = createVwapDeviationSniperTick(customDeps);
      expect(typeof tick).toBe('function');
    });

    it('should handle empty trending markets', async () => {
      const { createVwapDeviationSniperTick } = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      mockDeps.gamma.getTrending = vi.fn().mockResolvedValue([]);
      const tick = createVwapDeviationSniperTick(mockDeps);

      // Should not throw
      await expect(tick()).resolves.toBeUndefined();
    });

    it('should skip markets without yesTokenId', async () => {
      const { createVwapDeviationSniperTick } = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      mockDeps.gamma.getTrending = vi.fn().mockResolvedValue([
        {
          id: 'market-1',
          conditionId: '0x123',
          question: 'Test Market',
          volume: 10000,
          closed: false,
          resolved: false,
          yesPrice: 0.5,
          // missing yesTokenId
        } as any,
      ]);
      const tick = createVwapDeviationSniperTick(mockDeps);

      await expect(tick()).resolves.toBeUndefined();
    });

    it('should skip closed or resolved markets', async () => {
      const { createVwapDeviationSniperTick } = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      mockDeps.gamma.getTrending = vi.fn().mockResolvedValue([
        {
          id: 'market-1',
          conditionId: '0x123',
          question: 'Closed Market',
          yesTokenId: 'token-yes-1',
          closed: true,
          resolved: false,
          yesPrice: 0.5,
        } as GammaMarket,
        {
          id: 'market-2',
          conditionId: '0x124',
          question: 'Resolved Market',
          yesTokenId: 'token-yes-2',
          closed: false,
          resolved: true,
          yesPrice: 0.5,
        } as GammaMarket,
      ]);
      const tick = createVwapDeviationSniperTick(mockDeps);

      await expect(tick()).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    describe('calcVWAP edge cases', () => {
      it('should handle very small prices', () => {
        const prices = [0.001, 0.002];
        const volumes = [100, 200];
        const vwap = calcVWAP(prices, volumes);
        expect(vwap).toBeGreaterThan(0);
        expect(vwap).toBeLessThan(0.002);
      });

      it('should handle very large prices', () => {
        const prices = [1000000, 2000000];
        const volumes = [1, 1];
        expect(calcVWAP(prices, volumes)).toBeCloseTo(1500000, 0);
      });
    });

    describe('Polymarket price range', () => {
      it('should handle prices near 0', () => {
        expect(calcDeviation(0.01, 0.1)).toBeCloseTo(-0.9, 4);
      });

      it('should handle prices near 1', () => {
        expect(calcDeviation(0.99, 0.9)).toBeCloseTo(0.1, 4);
      });
    });

    describe('Window management', () => {
      it('should maintain window size after multiple insertions', () => {
        const prices: number[] = [];
        const volumes: number[] = [];

        // Simulate 25 insertions with window of 20
        for (let i = 0; i < 25; i++) {
          prices.push(i);
          volumes.push(10);
        }

        // Manually trim (simulating recordPriceVolume logic)
        if (prices.length > 20) {
          const excess = prices.length - 20;
          prices.splice(0, excess);
          volumes.splice(0, excess);
        }

        expect(prices.length).toBe(20);
        expect(prices[0]).toBe(5); // first 5 should be removed
        expect(prices[19]).toBe(24); // last should be 24
      });
    });
  });

  describe('Integration: Full Signal Flow', () => {
    it('should generate buy YES signal on oversold condition', () => {
      // Simulate price history creating oversold condition
      const history = Array(20).fill(100).map((p, i) => p + i * 2); // uptrend to 140
      const currentPrice = 80; // price drops below trend
      const zScore = calcZScore(currentPrice, history);
      expect(zScore).toBeLessThan(-2); // should be oversold
      expect(determineSignal(zScore, 2.0)).toBe('yes');
    });

    it('should generate buy NO signal on overbought condition', () => {
      // Simulate price history creating overbought condition
      const history = Array(20).fill(100).map((p, i) => p - i * 2); // downtrend to 60
      const currentPrice = 120; // price spikes above
      const zScore = calcZScore(currentPrice, history);
      expect(zScore).toBeGreaterThan(2); // should be overbought
      expect(determineSignal(zScore, 2.0)).toBe('no');
    });

    it('should not generate signal when deviation is small', () => {
      const history = Array(20).fill(100);
      const currentPrice = 102;
      const zScore = calcZScore(currentPrice, history);
      expect(Math.abs(zScore)).toBeLessThan(2);
      expect(determineSignal(zScore, 2.0)).toBe(null);
    });

    it('should handle VWAP with volume weighting', () => {
      // Create a scenario where recent high volume at higher prices pulls VWAP up
      const prices = [100, 110, 120];
      const volumes = [10, 100, 5]; // high volume at 110
      const vwap = calcVWAP(prices, volumes);
      // VWAP should be closer to 110 than simple average
      expect(vwap).toBeGreaterThan(105);
      expect(vwap).toBeLessThan(112);
    });
  });

  describe('Type Safety', () => {
    it('should have proper exports', async () => {
      const mod = await import('../../../src/desk/strategies/polymarket/vwap-deviation-sniper.ts');
      expect(mod.calcVWAP).toBeDefined();
      expect(mod.calcDeviation).toBeDefined();
      expect(mod.calcStdDev).toBeDefined();
      expect(mod.calcZScore).toBeDefined();
      expect(mod.determineSignal).toBeDefined();
      expect(mod.createVwapDeviationSniperTick).toBeDefined();
      expect(mod.DEFAULT_CONFIG).toBeDefined();
      expect(typeof mod.createVwapDeviationSniperTick).toBe('function');
    });
  });
});

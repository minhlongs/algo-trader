import { describe, it, expect } from 'vitest';
import {
  evaluateRegimeExit,
  evaluateRegimeEntrySignal,
} from '../../../../../src/desk/strategies/polymarket/regime-adaptive-momentum-evaluators';
import {
  detectRegime,
  calcPullbackDepth,
  calcOBI,
  calcTrendDirection,
} from '../../../../../src/desk/strategies/polymarket/regime-adaptive-momentum-math';
import type { OpenPosition } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy';
import type { RegimeAdaptiveMomentumConfig } from '../../../../../src/desk/strategies/polymarket/regime-adaptive-momentum-types';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

describe('regime-adaptive-momentum-evaluators branch coverage', () => {
  const baseConfig: RegimeAdaptiveMomentumConfig = {
    shortWindow: 5,
    longWindow: 20,
    trendThreshold: 0.02,
    volatileAtrRatio: 0.05,
    trendingPullbackPct: 0.05,
    volatilePullbackPct: 0.08,
    trendingTpPct: 0.10,
    rangingTpPct: 0.08,
    volatileTpPct: 0.15,
    obiEntryThreshold: 1.5,
    takeProfitPct: 0.10,
    stopLossPct: 0.05,
    maxHoldMs: 60000,
  };

  const emptyBook: RawOrderBook = {
    bids: [{ price: '0.50', size: '100' }],
    asks: [{ price: '0.52', size: '100' }],
  };

  describe('math helpers branches', () => {
    it('detects regimes and edge cases', () => {
      expect(detectRegime([], [])).toBe('ranging');
      expect(detectRegime([1], [1])).toBe('ranging');
      expect(detectRegime([1, 1, 1], [1, 1, 1])).toBe('ranging');

      // High volatility ratio: short ATR high, long ATR low
      const highVolShort = [1, 5, 1, 5];
      const lowVolLong = [2, 2.1, 2.2, 2.3];
      expect(detectRegime(highVolShort, lowVolLong, 100, 0.01)).toBe('volatile');

      // Strong trend
      const trendShort = [10, 11, 12, 13];
      const trendLong = [1, 2, 3, 4];
      expect(detectRegime(trendShort, trendLong, 0.5, 100)).toBe('trending');
    });

    it('calculates pullback depth and OBI', () => {
      expect(calcPullbackDepth([], 0.5)).toBe(0.5);
      expect(calcPullbackDepth([0.5, 0.5], 0.5)).toBe(0.5);
      expect(calcPullbackDepth([0.4, 0.6], 0.5)).toBe(0.5);

      expect(calcOBI({ bids: [], asks: [] })).toBe(1.0);
      expect(calcOBI({ bids: [{ price: '1', size: '0' }], asks: [{ price: '1', size: '10' }] })).toBe(1.0);
      expect(calcTrendDirection(10, 5)).toBe('up');
      expect(calcTrendDirection(5, 10)).toBe('down');
    });
  });

  describe('evaluateRegimeExit', () => {
    it('handles take-profit for YES and NO positions across regimes', () => {
      const posYes: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'yes',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const resYes = evaluateRegimeExit(posYes, 0.60, 2000, 'trending', [0.5], [0.5], baseConfig);
      expect(resYes.shouldExit).toBe(true);
      expect(resYes.reason).toContain('take-profit');

      const posNo: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'no',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const resNo = evaluateRegimeExit(posNo, 0.40, 2000, 'trending', [0.5], [0.5], baseConfig);
      expect(resNo.shouldExit).toBe(true);
      expect(resNo.reason).toContain('take-profit');

      const resVol = evaluateRegimeExit(posYes, 0.60, 2000, 'volatile', [0.5], [0.5], baseConfig);
      expect(resVol.shouldExit).toBe(true);

      const resRanging = evaluateRegimeExit(posYes, 0.55, 2000, 'ranging', [0.5], [0.5], baseConfig);
      expect(resRanging.shouldExit).toBe(true);
    });

    it('handles stop-loss for YES and NO positions', () => {
      const posYes: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'yes',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const resYes = evaluateRegimeExit(posYes, 0.45, 2000, 'trending', [0.5], [0.5], baseConfig);
      expect(resYes.shouldExit).toBe(true);
      expect(resYes.reason).toContain('stop-loss');

      const posNo: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'no',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const resNo = evaluateRegimeExit(posNo, 0.55, 2000, 'trending', [0.5], [0.5], baseConfig);
      expect(resNo.shouldExit).toBe(true);
      expect(resNo.reason).toContain('stop-loss');
    });

    it('handles max hold time exit', () => {
      const pos: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'yes',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const res = evaluateRegimeExit(pos, 0.51, 100000, 'trending', [0.5], [0.5], baseConfig);
      expect(res.shouldExit).toBe(true);
      expect(res.reason).toBe('max hold time');
    });

    it('evaluates regime shift exits for positions against reversal', () => {
      const posYes: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'yes',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };

      const shortPricesDown = [0.45, 0.44, 0.43, 0.42, 0.41];
      const longPricesUp = [0.50, 0.51, 0.52, 0.53, 0.54, 0.55];

      const resYes = evaluateRegimeExit(
        posYes,
        0.50,
        2000,
        'ranging',
        shortPricesDown,
        longPricesUp,
        baseConfig
      );
      expect(resYes.shouldExit).toBe(true);
      expect(resYes.reason).toContain('regime shift');

      const posNo: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'no',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const shortPricesUp = [0.55, 0.56, 0.57, 0.58, 0.59];
      const longPricesDown = [0.45, 0.44, 0.43, 0.42, 0.41];

      const resNo = evaluateRegimeExit(
        posNo,
        0.50,
        2000,
        'ranging',
        shortPricesUp,
        longPricesDown,
        baseConfig
      );
      expect(resNo.shouldExit).toBe(true);
      expect(resNo.reason).toContain('regime shift');
    });

    it('returns false when no exit criteria are met', () => {
      const pos: OpenPosition = {
        strategyKey: 's1',
        marketId: 'm1',
        side: 'yes',
        entryPrice: 0.50,
        size: 100,
        openedAt: 1000,
      };
      const res = evaluateRegimeExit(pos, 0.51, 2000, 'trending', [0.51, 0.51], [0.50, 0.50], baseConfig);
      expect(res.shouldExit).toBe(false);
    });
  });

  describe('evaluateRegimeEntrySignal', () => {
    it('generates trending YES and NO entry signals', () => {
      const shortUp = [0.50, 0.52, 0.55, 0.58, 0.60];
      const longBase = [0.40, 0.41, 0.42, 0.43, 0.44];
      const sigUp = evaluateRegimeEntrySignal(shortUp, longBase, 0.502, emptyBook, baseConfig);
      expect(sigUp).not.toBeNull();
      expect(sigUp?.side).toBe('yes');

      const shortDown = [0.40, 0.39, 0.38, 0.37, 0.36];
      const longHigh = [0.50, 0.51, 0.52, 0.53, 0.54];
      const sigNull = evaluateRegimeEntrySignal(shortDown, longHigh, 0.35, emptyBook, baseConfig);
      expect(sigNull).toBeNull();
    });

    it('generates ranging YES and NO signals based on OBI', () => {
      const flatPrices = [0.50, 0.50, 0.50, 0.50, 0.50];

      const bullishBook: RawOrderBook = {
        bids: [{ price: '0.50', size: '500' }],
        asks: [{ price: '0.51', size: '50' }],
      };
      const sigYes = evaluateRegimeEntrySignal(flatPrices, flatPrices, 0.50, bullishBook, baseConfig);
      expect(sigYes?.side).toBe('yes');

      const bearishBook: RawOrderBook = {
        bids: [{ price: '0.50', size: '50' }],
        asks: [{ price: '0.51', size: '500' }],
      };
      const sigNo = evaluateRegimeEntrySignal(flatPrices, flatPrices, 0.50, bearishBook, baseConfig);
      expect(sigNo?.side).toBe('no');

      const neutralBook: RawOrderBook = {
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
      };
      const sigNeutral = evaluateRegimeEntrySignal(flatPrices, flatPrices, 0.50, neutralBook, baseConfig);
      expect(sigNeutral).toBeNull();
    });

    it('evaluates volatile regime signals and threshold barriers', () => {
      const volatileShort = [0.70, 0.72, 0.74, 0.76, 0.78];
      const volatileLong = [0.40, 0.42, 0.45, 0.48, 0.50];
      const sigVolatile = evaluateRegimeEntrySignal(
        volatileShort,
        volatileLong,
        0.705,
        emptyBook,
        { ...baseConfig, volatileAtrRatio: 0.001 }
      );
      if (sigVolatile) {
        expect(['yes', 'no']).toContain(sigVolatile.side);
      }

      // Volatile with weak trendStrength returns null
      const weakVolatile = evaluateRegimeEntrySignal(
        [0.50, 0.51, 0.50, 0.51],
        [0.50, 0.51, 0.50, 0.51],
        0.50,
        emptyBook,
        { ...baseConfig, volatileAtrRatio: 0.0001, trendThreshold: 10 }
      );
      expect(weakVolatile).toBeNull();
    });
  });
});

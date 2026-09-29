import { describe, it, expect } from 'vitest';
import {
  computePositionDelta,
  computePortfolioDelta,
  estimateHedgeSize,
  computePositionPnl,
  computePortfolioPnl,
} from '../../../../../src/desk/strategies/polymarket/delta-calculator';
import type { HedgePosition } from '../../../../../src/shared/types/delta-neutral-types';

describe('Delta Calculator', () => {
  const makePos = (
    marketId: string,
    side: 'YES' | 'NO',
    size: number,
    currentPrice: number,
    entryPrice: number = 0.5
  ): HedgePosition => ({
    marketId,
    side,
    size,
    currentPrice,
    entryPrice,
    delta: 0,
    entryTime: Date.now(),
  });

  describe('computePositionDelta', () => {
    it('computes delta correctly for YES positions', () => {
      // effectivePrice = 0.7. delta = 100 * (0.7 - 0.5) / 0.5 = 40
      const pos = makePos('m1', 'YES', 100, 0.7);
      const res = computePositionDelta(pos);
      expect(res.marketId).toBe('m1');
      expect(res.side).toBe('YES');
      expect(res.delta).toBeCloseTo(40, 4);
    });

    it('computes delta correctly for NO positions (inverts effective price)', () => {
      // effectivePrice = 1 - 0.3 = 0.7. delta = 100 * (0.7 - 0.5) / 0.5 = 40
      const pos = makePos('m2', 'NO', 100, 0.3);
      const res = computePositionDelta(pos);
      expect(res.marketId).toBe('m2');
      expect(res.side).toBe('NO');
      expect(res.delta).toBeCloseTo(40, 4);
    });
  });

  describe('computePortfolioDelta', () => {
    it('computes netDelta and returns isNeutral true when within threshold', () => {
      const positions = [
        makePos('m1', 'YES', 100, 0.55), // effectivePrice 0.55 -> delta = 100 * 0.1 = 10
        makePos('m2', 'YES', 100, 0.45), // effectivePrice 0.45 -> delta = 100 * -0.1 = -10
      ];
      const res = computePortfolioDelta(positions, 1.0);
      expect(res.netDelta).toBeCloseTo(0, 4);
      expect(res.positionDeltas).toHaveLength(2);
      expect(res.isNeutral).toBe(true);
    });

    it('returns isNeutral false when netDelta exceeds threshold', () => {
      const positions = [
        makePos('m1', 'YES', 100, 0.8), // delta = 60
      ];
      const res = computePortfolioDelta(positions, 5.0);
      expect(res.netDelta).toBeCloseTo(60, 4);
      expect(res.isNeutral).toBe(false);
    });
  });

  describe('estimateHedgeSize', () => {
    it('returns 0 when market price is exactly 0.5', () => {
      expect(estimateHedgeSize(10, 0.5, 100)).toBe(0);
      expect(estimateHedgeSize(10, 0.500000001, 100)).toBe(0);
    });

    it('calculates hedge size and caps at maxSize', () => {
      // priceDev = (0.75 - 0.5) / 0.5 = 0.5. rawSize = 20 / 0.5 = 40
      expect(estimateHedgeSize(20, 0.75, 100)).toBeCloseTo(40, 4);
      // Capped at maxSize (30 < 40)
      expect(estimateHedgeSize(20, 0.75, 30)).toBe(30);
    });
  });

  describe('computePositionPnl & computePortfolioPnl', () => {
    it('computes PnL for YES position', () => {
      const pos = makePos('m1', 'YES', 100, 0.65, 0.50);
      expect(computePositionPnl(pos)).toBeCloseTo(15, 4);
    });

    it('computes PnL for NO position', () => {
      const pos = makePos('m2', 'NO', 100, 0.35, 0.50);
      // Entry 0.50 - Current 0.35 = 0.15 * 100 = 15
      expect(computePositionPnl(pos)).toBeCloseTo(15, 4);
    });

    it('computes aggregate portfolio PnL across multiple positions', () => {
      const positions = [
        makePos('m1', 'YES', 100, 0.65, 0.50), // +15
        makePos('m2', 'NO', 100, 0.35, 0.50),  // +15
        makePos('m3', 'YES', 50, 0.40, 0.50),  // -5
      ];
      expect(computePortfolioPnl(positions)).toBeCloseTo(25, 4);
    });
  });
});

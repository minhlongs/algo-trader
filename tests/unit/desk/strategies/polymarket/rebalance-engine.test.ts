import { describe, it, expect } from 'vitest';
import {
  requiresRebalance,
  computeRebalanceSignals,
  applyRebalanceSignals,
} from '../../../../../src/desk/strategies/polymarket/rebalance-engine';
import type {
  DeltaNeutralPortfolio,
  HedgePosition,
  RebalanceSignal,
} from '../../../../../src/shared/types/delta-neutral-types';

describe('Rebalance Engine', () => {
  const makePortfolio = (netDelta: number, positions: HedgePosition[] = []): DeltaNeutralPortfolio => ({
    marketId: 'm-1',
    positions,
    netDelta,
    totalExposure: 1000,
    leverage: 1.0,
    status: 'ACTIVE',
  });

  describe('requiresRebalance', () => {
    it('returns true when absolute netDelta exceeds threshold', () => {
      expect(requiresRebalance(makePortfolio(0.15), 0.10)).toBe(true);
      expect(requiresRebalance(makePortfolio(-0.15), 0.10)).toBe(true);
    });

    it('returns false when absolute netDelta is within threshold', () => {
      expect(requiresRebalance(makePortfolio(0.08), 0.10)).toBe(false);
      expect(requiresRebalance(makePortfolio(-0.08), 0.10)).toBe(false);
      expect(requiresRebalance(makePortfolio(0.10), 0.10)).toBe(false);
    });
  });

  describe('computeRebalanceSignals', () => {
    it('returns immediately with empty signals when delta is already within threshold', () => {
      const p = makePortfolio(0.05, [
        { marketId: 'm-1', side: 'YES', size: 100, currentPrice: 0.6, entryPrice: 0.5, delta: 0.05, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.10, 100);
      expect(res.signals).toEqual([]);
      expect(res.deltaBefore).toBe(0.05);
      expect(res.deltaAfter).toBe(0.05);
      expect(res.estimatedCost).toBe(0);
    });

    it('generates SELL signal to reduce positive delta on YES and NO positions', () => {
      const p = makePortfolio(10.0, [
        { marketId: 'm-yes', side: 'YES', size: 100, currentPrice: 0.8, entryPrice: 0.5, delta: 6.0, entryTime: Date.now() },
        { marketId: 'm-no', side: 'NO', size: 100, currentPrice: 0.2, entryPrice: 0.5, delta: 4.0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.10, 50);
      expect(res.signals.length).toBeGreaterThan(0);
      expect(res.signals[0].action).toBe('SELL');
      expect(res.deltaAfter).toBeDefined();
      expect(res.estimatedCost).toBeGreaterThan(0);
    });

    it('generates BUY signal to increase exposure when delta is negative', () => {
      const p = makePortfolio(-10.0, [
        { marketId: 'm-1', side: 'YES', size: 100, currentPrice: 0.75, entryPrice: 0.5, delta: -10.0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.05, 100);
      expect(res.signals.length).toBeGreaterThan(0);
      expect(res.signals[0].action).toBe('BUY');
      expect(res.deltaAfter).toBeDefined();
    });

    it('generates signal for NO position and handles price lookup fallback', () => {
      const p = makePortfolio(10.0, [
        { marketId: 'm-no-only', side: 'NO', size: 100, currentPrice: 0.1, entryPrice: 0.5, delta: 8.0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.10, 50);
      expect(res.signals.length).toBeGreaterThan(0);
      expect(res.signals[0].side).toBe('NO');
      expect(res.signals[0].action).toBe('SELL');
    });

    it('generates BUY signal for NO position when delta is negative', () => {
      const p = makePortfolio(-10.0, [
        { marketId: 'm-no-buy', side: 'NO', size: 100, currentPrice: 0.1, entryPrice: 0.5, delta: -8.0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.10, 50);
      expect(res.signals.length).toBeGreaterThan(0);
      expect(res.signals[0].side).toBe('NO');
      expect(res.signals[0].action).toBe('BUY');
    });

    it('skips positions where effective price deviation is near zero (price = 0.5)', () => {
      const p = makePortfolio(10.0, [
        { marketId: 'm-neutral', side: 'YES', size: 100, currentPrice: 0.50, entryPrice: 0.5, delta: 0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.10, 50);
      expect(res.signals).toEqual([]);
    });

    it('skips positions where estimated hedge size is less than 1', () => {
      const p = makePortfolio(0.1, [
        { marketId: 'm-tiny', side: 'YES', size: 100, currentPrice: 0.8, entryPrice: 0.5, delta: 0.1, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.01, 50);
      expect(res.signals).toEqual([]);
    });

    it('stops iterating when max iterations reached or no trade improves delta', () => {
      const p = makePortfolio(100.0, [
        { marketId: 'm-1', side: 'YES', size: 2, currentPrice: 0.55, entryPrice: 0.5, delta: 1.0, entryTime: Date.now() },
      ]);
      const res = computeRebalanceSignals(p, 0.01, 2);
      expect(res.signals.length).toBeLessThanOrEqual(10);
    });
  });

  describe('applyRebalanceSignals', () => {
    it('applies BUY and SELL signals and ignores missing positions', () => {
      const initial: HedgePosition[] = [
        { marketId: 'm-1', side: 'YES', size: 50, currentPrice: 0.6, entryPrice: 0.5, delta: 0.1, entryTime: Date.now() },
        { marketId: 'm-2', side: 'NO', size: 30, currentPrice: 0.4, entryPrice: 0.5, delta: -0.1, entryTime: Date.now() },
      ];

      const signals: RebalanceSignal[] = [
        { marketId: 'm-1', side: 'YES', action: 'BUY', size: 20, reason: 'Buy more' },
        { marketId: 'm-2', side: 'NO', action: 'SELL', size: 40, reason: 'Sell exceeding size' },
        { marketId: 'm-nonexistent', side: 'YES', action: 'BUY', size: 10, reason: 'Not in list' },
      ];

      const updated = applyRebalanceSignals(initial, signals);
      expect(updated[0].size).toBe(70); // 50 + 20
      expect(updated[1].size).toBe(0);  // Math.max(0, 30 - 40) = 0
      expect(initial[0].size).toBe(50); // immutability check
    });
  });
});

/**
 * Tests for base-polymarket-strategy-exits — pure helpers for TP/SL/maxHold
 * exit logic and PnL math.
 *
 * Covers:
 *   computePositionGain
 *   evaluateExitCondition
 *   computeExitPnl
 *
 * All functions are pure with no side effects or dependencies.
 */

import { describe, it, expect } from 'vitest';
import {
  computePositionGain,
  evaluateExitCondition,
  computeExitPnl,
} from '../base-polymarket-strategy-exits';
import type { BaseStrategyConfig, CustomExitVerdict, OpenPosition } from '../base-polymarket-strategy-types';

const DEFAULT_CONFIG: BaseStrategyConfig = {
  minVolume: 1000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 5 * 60_000,
  maxPositions: 3,
  cooldownMs: 60_000,
  positionSize: '25',
};

function makePosition(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    tokenId: 'yes-1',
    conditionId: 'c-1',
    side: 'yes',
    entryPrice: 0.5,
    sizeUsdc: 25,
    orderId: 'oid-1',
    openedAt: Date.now() - 60_000, // 1 minute ago
    ...overrides,
  };
}

describe('base-polymarket-strategy-exits', () => {
  describe('computePositionGain', () => {
    it('returns positive gain for YES when price rises', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5 });
      expect(computePositionGain(pos, 0.55)).toBeCloseTo(0.1, 6); // (0.55-0.5)/0.5 = 0.1
    });

    it('returns negative gain for YES when price falls', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5 });
      expect(computePositionGain(pos, 0.45)).toBeCloseTo(-0.1, 6); // (0.45-0.5)/0.5 = -0.1
    });

    it('returns positive gain for NO when price falls', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5 });
      expect(computePositionGain(pos, 0.45)).toBeCloseTo(0.1, 6); // (0.5-0.45)/0.5 = 0.1
    });

    it('returns negative gain for NO when price rises', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5 });
      expect(computePositionGain(pos, 0.55)).toBeCloseTo(-0.1, 6); // (0.5-0.55)/0.5 = -0.1
    });

    it('returns 0 when price equals entryPrice', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5 });
      expect(computePositionGain(pos, 0.5)).toBe(0);
    });

    it('handles different entry prices', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.3 });
      expect(computePositionGain(pos, 0.33)).toBeCloseTo(0.1, 6); // (0.33-0.3)/0.3 = 0.1
    });
  });

  describe('evaluateExitCondition', () => {
    const now = Date.now();

    it('returns take-profit when gain >= takeProfitPct for YES', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      // gain = (0.52 - 0.5) / 0.5 = 0.04 >= 0.03 (takeProfitPct)
      const r = evaluateExitCondition(pos, 0.52, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('take-profit');
    });

    it('returns take-profit when gain >= takeProfitPct for NO', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5, openedAt: now - 1000 });
      // gain = (0.5 - 0.48) / 0.5 = 0.04 >= 0.03
      const r = evaluateExitCondition(pos, 0.48, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('take-profit');
    });

    it('returns stop-loss when -gain >= stopLossPct for YES', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      // gain = (0.48 - 0.5) / 0.5 = -0.04, -gain = 0.04 >= 0.02 (stopLossPct)
      const r = evaluateExitCondition(pos, 0.48, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('stop-loss');
    });

    it('returns stop-loss when -gain >= stopLossPct for NO', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5, openedAt: now - 1000 });
      // gain = (0.5 - 0.52) / 0.5 = -0.04, -gain = 0.04 >= 0.02
      const r = evaluateExitCondition(pos, 0.52, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('stop-loss');
    });

    it('returns max-hold when elapsed > maxHoldMs', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 10 * 60_000 }); // 10 min ago
      // elapsed = 10 min > 5 min (maxHoldMs)
      const r = evaluateExitCondition(pos, 0.5, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toBe('max hold time');
    });

    it('returns custom exit when provided and TP/SL/maxHold did not fire', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const custom: CustomExitVerdict = { exit: true, reason: 'mean-reversion' };
      // gain = (0.505 - 0.5) / 0.5 = 0.01 < 0.03 TP, -gain = 0.01 < 0.02 SL, elapsed = 1s < 5min
      const r = evaluateExitCondition(pos, 0.505, DEFAULT_CONFIG, custom, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toBe('mean-reversion');
    });

    it('ignores custom exit when take-profit already fired', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const custom: CustomExitVerdict = { exit: true, reason: 'should-be-ignored' };
      // gain = 0.04 >= 0.03 TP fires first
      const r = evaluateExitCondition(pos, 0.52, DEFAULT_CONFIG, custom, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('take-profit');
    });

    it('ignores custom exit when stop-loss already fired', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const custom: CustomExitVerdict = { exit: true, reason: 'should-be-ignored' };
      // gain = -0.04, -gain = 0.04 >= 0.02 SL fires first
      const r = evaluateExitCondition(pos, 0.48, DEFAULT_CONFIG, custom, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toContain('stop-loss');
    });

    it('ignores custom exit when max-hold already fired', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 10 * 60_000 });
      const custom: CustomExitVerdict = { exit: true, reason: 'should-be-ignored' };
      // elapsed = 10 min > 5 min maxHold fires first
      const r = evaluateExitCondition(pos, 0.5, DEFAULT_CONFIG, custom, now);
      expect(r.shouldExit).toBe(true);
      expect(r.reason).toBe('max hold time');
    });

    it('does not exit when custom is undefined and no TP/SL/maxHold', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      // gain = 0.01 < TP, -gain = 0.01 < SL, elapsed = 1s < maxHold
      const r = evaluateExitCondition(pos, 0.505, DEFAULT_CONFIG, undefined, now);
      expect(r.shouldExit).toBe(false);
      expect(r.reason).toBe('');
    });

    it('does not exit when custom.exit = false and no TP/SL/maxHold', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const custom: CustomExitVerdict = { exit: false, reason: '' };
      // gain = 0.01 < TP, -gain = 0.01 < SL, elapsed = 1s < maxHold
      const r = evaluateExitCondition(pos, 0.505, DEFAULT_CONFIG, custom, now);
      expect(r.shouldExit).toBe(false);
      expect(r.reason).toBe('');
    });

    it('uses exact boundary values for TP/SL/maxHold', () => {
      // Exactly at take-profit threshold
      const posTp = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const rTp = evaluateExitCondition(posTp, 0.515, DEFAULT_CONFIG, undefined, now); // gain = 0.03 exactly
      expect(rTp.shouldExit).toBe(true);
      expect(rTp.reason).toContain('take-profit');

      // Exactly at stop-loss threshold
      const posSl = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const rSl = evaluateExitCondition(posSl, 0.49, DEFAULT_CONFIG, undefined, now); // -gain = 0.02 exactly
      expect(rSl.shouldExit).toBe(true);
      expect(rSl.reason).toContain('stop-loss');

      // Exactly at max-hold threshold: code uses strict `>`, so equal does NOT fire
      const posMh = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 5 * 60_000 });
      const rMh = evaluateExitCondition(posMh, 0.5, DEFAULT_CONFIG, undefined, now); // elapsed = 5 min exactly
      expect(rMh.shouldExit).toBe(false);
    });

    it('does not exit when just below thresholds', () => {
      // Just below take-profit
      const posTp = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const rTp = evaluateExitCondition(posTp, 0.5149, DEFAULT_CONFIG, undefined, now); // gain = 0.0298 < 0.03
      expect(rTp.shouldExit).toBe(false);

      // Just below stop-loss
      const posSl = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 1000 });
      const rSl = evaluateExitCondition(posSl, 0.4901, DEFAULT_CONFIG, undefined, now); // -gain = 0.0198 < 0.02
      expect(rSl.shouldExit).toBe(false);

      // Just below max-hold
      const posMh = makePosition({ side: 'yes', entryPrice: 0.5, openedAt: now - 5 * 60_000 + 1 });
      const rMh = evaluateExitCondition(posMh, 0.5, DEFAULT_CONFIG, undefined, now); // elapsed = 4:59.999
      expect(rMh.shouldExit).toBe(false);
    });
  });

  describe('computeExitPnl', () => {
    const now = Date.now();

    it('returns positive PnL for winning YES position', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, sizeUsdc: 25, openedAt: now - 1000 });
      // (0.55 - 0.5) * (25 / 0.5) = 0.05 * 50 = 2.5
      expect(computeExitPnl(pos, 0.55)).toBeCloseTo(2.5, 6);
    });

    it('returns negative PnL for losing YES position', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, sizeUsdc: 25, openedAt: now - 1000 });
      // (0.45 - 0.5) * (25 / 0.5) = -0.05 * 50 = -2.5
      expect(computeExitPnl(pos, 0.45)).toBeCloseTo(-2.5, 6);
    });

    it('returns positive PnL for winning NO position', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5, sizeUsdc: 25, openedAt: now - 1000 });
      // (0.5 - 0.45) * (25 / 0.5) = 0.05 * 50 = 2.5
      expect(computeExitPnl(pos, 0.45)).toBeCloseTo(2.5, 6);
    });

    it('returns negative PnL for losing NO position', () => {
      const pos = makePosition({ side: 'no', entryPrice: 0.5, sizeUsdc: 25, openedAt: now - 1000 });
      // (0.5 - 0.55) * (25 / 0.5) = -0.05 * 50 = -2.5
      expect(computeExitPnl(pos, 0.55)).toBeCloseTo(-2.5, 6);
    });

    it('returns 0 PnL when price equals entryPrice', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.5, sizeUsdc: 25, openedAt: now - 1000 });
      expect(computeExitPnl(pos, 0.5)).toBe(0);
    });

    it('scales with sizeUsdc', () => {
      const pos1 = makePosition({ side: 'yes', entryPrice: 0.5, sizeUsdc: 10, openedAt: now - 1000 });
      const pos2 = makePosition({ side: 'yes', entryPrice: 0.5, sizeUsdc: 100, openedAt: now - 1000 });
      const pnl1 = computeExitPnl(pos1, 0.55);
      const pnl2 = computeExitPnl(pos2, 0.55);
      expect(pnl2).toBeCloseTo(pnl1 * 10, 6);
    });

    it('handles fractional sizes and prices', () => {
      const pos = makePosition({ side: 'yes', entryPrice: 0.333, sizeUsdc: 12.5, openedAt: now - 1000 });
      // (0.3663 - 0.333) * (12.5 / 0.333) = 0.0333 * 37.54 = ~1.25
      expect(computeExitPnl(pos, 0.3663)).toBeCloseTo(1.25, 2);
    });
  });
});
/**
 * Signal Fusion Regime — unit tests
 * Verifies regime-adaptive weight adjustment for signal fusion.
 */

import { describe, it, expect } from 'vitest';
import {
  fuseSignals,
  adaptWeightsForRegime,
  type SignalInput,
} from '../../intelligence/signal-fusion-engine';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    name: 'momentum-macd',
    score: 0.5,
    weight: 1.0,
    ...overrides,
  };
}

// ── adaptWeightsForRegime ────────────────────────────────────────────────────

describe('adaptWeightsForRegime', () => {
  describe('trending_up regime', () => {
    it('boosts momentum/trend/macd signal weights by 20%', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'momentum-rsi', weight: 1.0 }),
        makeSignal({ name: 'trend-ema', weight: 1.0 }),
        makeSignal({ name: 'macd-cross', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_up');
      for (const s of adapted) {
        expect(s.weight).toBeCloseTo(1.2);
      }
    });

    it('penalises mean-reversion signal weights by 10%', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'revert-bb', weight: 1.0 }),
        makeSignal({ name: 'reversal-pattern', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_up');
      for (const s of adapted) {
        expect(s.weight).toBeCloseTo(0.9);
      }
    });

    it('unaffected signals keep original weight', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'volatility-atr', weight: 1.0 }),
        makeSignal({ name: 'range-breakout', weight: 0.5 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_up');
      expect(adapted[0].weight).toBe(1.0);
      expect(adapted[1].weight).toBe(0.5);
    });
  });

  describe('trending_down regime', () => {
    it('boosts mean-reversion signal weights by 20%', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'revert-sma', weight: 1.0 }),
        makeSignal({ name: 'reversal-confirm', weight: 0.8 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_down');
      expect(adapted[0].weight).toBeCloseTo(1.2);
      expect(adapted[1].weight).toBeCloseTo(0.96);
    });

    it('penalises momentum/trend/macd signal weights by 10%', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'momentum-div', weight: 1.0 }),
        makeSignal({ name: 'trend-adx', weight: 1.0 }),
        makeSignal({ name: 'macd-signal', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_down');
      for (const s of adapted) {
        expect(s.weight).toBeCloseTo(0.9);
      }
    });

    it('unaffected signals keep original weight', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'volatility-squeeze', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'trending_down');
      expect(adapted[0].weight).toBe(1.0);
    });
  });

  describe('ranging regime', () => {
    it('boosts volatility/range/bb signal weights by 15%', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'volatility-atr', weight: 1.0 }),
        makeSignal({ name: 'range-support', weight: 1.0 }),
        makeSignal({ name: 'bb-width', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'ranging');
      for (const s of adapted) {
        expect(s.weight).toBeCloseTo(1.15);
      }
    });

    it('unaffected signals keep original weight in ranging', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'momentum-rsi', weight: 1.0 }),
        makeSignal({ name: 'revert-bb', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'ranging');
      expect(adapted[0].weight).toBe(1.0);
      expect(adapted[1].weight).toBe(1.0);
    });
  });

  describe('volatile regime (default — no adjustment)', () => {
    it('all signals keep original weight under volatile regime', () => {
      const signals: SignalInput[] = [
        makeSignal({ name: 'momentum-rsi', weight: 0.8 }),
        makeSignal({ name: 'revert-bb', weight: 0.9 }),
        makeSignal({ name: 'volatility-atr', weight: 1.0 }),
      ];
      const adapted = adaptWeightsForRegime(signals, 'volatile');
      expect(adapted[0].weight).toBe(0.8);
      expect(adapted[1].weight).toBe(0.9);
      expect(adapted[2].weight).toBe(1.0);
    });
  });

  describe('empty / edge cases', () => {
    it('empty signals returns empty array', () => {
      const adapted = adaptWeightsForRegime([], 'trending_up');
      expect(adapted).toEqual([]);
    });

    it('undefined regime returns signals unchanged', () => {
      const signals = [makeSignal({ name: 'momentum', weight: 0.7 })];
      const adapted = adaptWeightsForRegime(signals, '');
      expect(adapted).toBe(signals);
    });

    it('unknown regime string returns signals unchanged', () => {
      const signals = [makeSignal({ name: 'momentum', weight: 0.7 })];
      const adapted = adaptWeightsForRegime(signals, 'unknown_regime');
      expect(adapted[0].weight).toBe(0.7);
    });

    it('is case-insensitive for regime names', () => {
      const signals = [makeSignal({ name: 'momentum', weight: 1.0 })];
      const adapted = adaptWeightsForRegime(signals, 'TRENDING_UP');
      expect(adapted[0].weight).toBeCloseTo(1.2);
    });
  });
});

// ── fuseSignals with regime ──────────────────────────────────────────────────

describe('fuseSignals with regime', () => {
  it('applies trending_up boost — momentum signal dominates', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: 0.8, weight: 1.0 }),
      makeSignal({ name: 'revert', score: -0.5, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'trending_up');
    // momentum weight=1.2, revert weight=0.9 → weighted score
    // (0.8*1.2 + -0.5*0.9) / (1.2 + 0.9) = (0.96 - 0.45) / 2.1 = 0.51 / 2.1 ≈ 0.243
    expect(result.direction).toBe('UP');
    expect(result.weightedScore).toBeCloseTo(0.243, 2);
  });

  it('applies trending_down boost — mean-reversion signal dominates', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: 0.5, weight: 1.0 }),
      makeSignal({ name: 'revert', score: -0.7, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'trending_down');
    // momentum weight=0.9, revert weight=1.2 → weighted score
    // (0.5*0.9 + -0.7*1.2) / (0.9 + 1.2) = (0.45 - 0.84) / 2.1 = -0.39 / 2.1 ≈ -0.186
    expect(result.direction).toBe('DOWN');
    expect(result.weightedScore).toBeCloseTo(-0.186, 2);
  });

  it('applies ranging boost — volatility signal weighted higher', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: -0.3, weight: 1.0 }),
      makeSignal({ name: 'volatility-bb', score: 0.6, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'ranging');
    // momentum weight=1.0 (unaffected), volatility weight=1.15 → weighted score
    // (-0.3*1.0 + 0.6*1.15) / (1.0 + 1.15) = (-0.3 + 0.69) / 2.15 = 0.39 / 2.15 ≈ 0.181
    expect(result.direction).toBe('UP');
    expect(result.weightedScore).toBeCloseTo(0.181, 2);
  });

  it('no regime provided — same behavior as original fuseSignals', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: 0.5, weight: 1.0 }),
      makeSignal({ name: 'revert', score: -0.4, weight: 1.0 }),
    ];
    const withRegime = fuseSignals(signals, 'trending_up');
    const withoutRegime = fuseSignals(signals);
    // With regime: weights differ => different result
    expect(withRegime.weightedScore).not.toBeCloseTo(withoutRegime.weightedScore, 3);
    // Without regime: equal-weight average = (0.5 + -0.4)/2 = 0.05
    expect(withoutRegime.weightedScore).toBeCloseTo(0.05, 3);
    expect(withoutRegime.direction).toBe('NEUTRAL');
  });
});

/**
 * Signal Fusion Regime — integration tests
 * Verifies fuseSignals behavior with different market regimes.
 */

import { describe, it, expect } from 'vitest';
import {
  fuseSignals,
  type SignalInput,
} from '../../intelligence/signal-fusion-engine';
import { makeSignal } from './signal-fusion-regime-fixtures';

describe('fuseSignals with regime', () => {
  it('applies trending_up boost — momentum signal dominates', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: 0.8, weight: 1.0 }),
      makeSignal({ name: 'revert', score: -0.5, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'trending_up');
    expect(result.direction).toBe('UP');
    expect(result.weightedScore).toBeCloseTo(0.243, 2);
  });

  it('applies trending_down boost — mean-reversion signal dominates', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: 0.5, weight: 1.0 }),
      makeSignal({ name: 'revert', score: -0.7, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'trending_down');
    expect(result.direction).toBe('DOWN');
    expect(result.weightedScore).toBeCloseTo(-0.186, 2);
  });

  it('applies ranging boost — volatility signal weighted higher', () => {
    const signals: SignalInput[] = [
      makeSignal({ name: 'momentum', score: -0.3, weight: 1.0 }),
      makeSignal({ name: 'volatility-bb', score: 0.6, weight: 1.0 }),
    ];
    const result = fuseSignals(signals, 'ranging');
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
    expect(withRegime.weightedScore).not.toBeCloseTo(withoutRegime.weightedScore, 3);
    expect(withoutRegime.weightedScore).toBeCloseTo(0.05, 3);
    expect(withoutRegime.direction).toBe('NEUTRAL');
  });
});

/**
 * Tests for consensus-engine.ts (regime dynamics & formatting).
 *
 * Verifies regime-aware confidence adjustments, filtering gates,
 * and reason text formatting.
 */
import { describe, it, expect } from 'vitest';
import { computeConsensus } from '../consensus-engine.js';
import { sig, regime, input, NOW } from './consensus-engine-fixtures.js';

describe('computeConsensus regime', () => {
  it('trending_up yields higher output.confidence vs same input in ranging', () => {
    const inputs = [
      sig('1d', 'bull', 0.9),
      sig('4h', 'bull', 0.85),
      sig('1h', 'bear', 0.2),
    ];
    const trend = computeConsensus(
      input(inputs, regime({ regime: 'trending_up', regimeConfidence: 0.8 })),
    );
    const range = computeConsensus(
      input(inputs, regime({ regime: 'ranging', regimeConfidence: 0.5 })),
    );
    expect(trend.confidence).toBeGreaterThan(range.confidence);
    expect(trend.action).toBe(range.action);
  });

  it('trending_down raises output.confidence for bear consensus', () => {
    const inputs = [
      sig('1d', 'bear', 0.9),
      sig('4h', 'bear', 0.85),
      sig('1h', 'bull', 0.2),
    ];
    const trend = computeConsensus(
      input(inputs, regime({ regime: 'trending_down', regimeConfidence: 0.8 })),
    );
    const range = computeConsensus(
      input(inputs, regime({ regime: 'ranging', regimeConfidence: 0.5 })),
    );
    expect(trend.confidence).toBeGreaterThan(range.confidence);
    expect(trend.action).toBe(range.action);
  });

  it('regimeConfidence surfaces in reason and regime field', () => {
    const sameSignals = [sig('1d', 'bull', 0.8), sig('4h', 'bull', 0.75), sig('1h', 'bull', 0.6)];
    const tUp = computeConsensus(
      input(
        sameSignals,
        regime({ regime: 'trending_up', regimeConfidence: 0.95 }),
        't1',
        NOW,
        { minTfAgreement: 1 },
      ),
    );
    const tDown = computeConsensus(
      input(
        sameSignals,
        regime({ regime: 'trending_down', regimeConfidence: 0.95 }),
        't2',
        NOW,
        { minTfAgreement: 1 },
      ),
    );
    expect(tUp.action).toBe('enter_long');
    expect(tDown.action).toBe('enter_long');
    expect(tUp.regime).toBe('trending_up');
    expect(tDown.regime).toBe('trending_down');
    expect(tUp.reason).toContain('trending_up');
    expect(tDown.reason).toContain('trending_down');
  });

  it('regime boost is bounded by 1.0', () => {
    const out = computeConsensus(
      input(
        [sig('1d', 'bull', 0.99), sig('4h', 'bull', 0.99), sig('1h', 'bull', 0.99)],
        regime({ regime: 'trending_up', regimeConfidence: 0.9 }),
      ),
    );
    expect(out.confidence).toBeLessThanOrEqual(1.0);
  });

  it('volatile regime reduces confidence', () => {
    const inputs = [
      sig('1d', 'bull', 0.9),
      sig('4h', 'bull', 0.85),
      sig('1h', 'bear', 0.2),
    ];
    const vol = computeConsensus(
      input(inputs, regime({ regime: 'volatile', regimeConfidence: 0.7 })),
    );
    const range = computeConsensus(
      input(inputs, regime({ regime: 'ranging', regimeConfidence: 0.5 })),
    );
    expect(vol.confidence).toBeLessThan(range.confidence);
  });

  it('signals below per-TF threshold are filtered out', () => {
    const below = computeConsensus(input([sig('1d', 'bear', 0.2)], regime()));
    expect(below.action).not.toBe('enter_short');
  });

  it('above-threshold bear with strong vote count wins', () => {
    const out = computeConsensus(
      input([
        sig('1d', 'bear', 0.6),
        sig('4h', 'bear', 0.6),
        sig('1h', 'bear', 0.6),
      ], regime()),
    );
    expect(out.action).toBe('enter_short');
  });

  it('regime string on output equals input regime', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull')], regime({ regime: 'trending_up' })),
    );
    expect(out.regime).toBe('trending_up');
  });

  it('reason is a non-empty string', () => {
    const out = computeConsensus(input([sig('1d', 'bull', 0.8)], regime()));
    expect(typeof out.reason).toBe('string');
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('reason includes the action and regime fields', () => {
    const out = computeConsensus(
      input(
        [sig('1d', 'bull', 0.8), sig('4h', 'bull', 0.8), sig('1h', 'bull', 0.6)],
        regime({ regime: 'trending_up' }),
        'my-trace',
      ),
    );
    expect(out.reason).toContain('consensus=');
    expect(out.reason).toContain('regime=trending_up');
    expect(out.reason).toContain('agreement=3/3');
  });

  it('reason mentions the winning action', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.8), sig('4h', 'bull', 0.8), sig('1h', 'bear', 0.2)], regime()),
    );
    expect(out.reason.toLowerCase()).toContain('bull');
  });
});

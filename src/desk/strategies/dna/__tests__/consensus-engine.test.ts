/**
 * Tests for consensus-engine.ts (core consensus & weighting).
 *
 * Verifies computeConsensus with the real public API:
 *   { tfSignals: TfSignal[], regime: RegimeSnapshot, traceId, now, config? }
 */
import { describe, it, expect } from 'vitest';
import { computeConsensus } from '../consensus-engine.js';
import { NOW, IND, sig, regime, input } from './consensus-engine-fixtures.js';

describe('computeConsensus', () => {
  it('returns a ConsensusSignal with required fields', () => {
    const out = computeConsensus(input([sig('1d', 'bull')], regime()));
    expect(out).toBeDefined();
    expect(typeof out.traceId).toBe('string');
    expect(out.traceId.length).toBeGreaterThan(0);
    expect(typeof out.emittedAt).toBe('number');
    expect(out.emittedAt).toBe(NOW);
  });

  it('3 high-confidence bulls vs 1 bear => enter_long', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.95), sig('4h', 'bull', 0.9), sig('1h', 'bull', 0.85), sig('1m', 'bear', 0.3)], regime()),
    );
    expect(out.action).toBe('enter_long');
    expect(out.direction).toBe('long');
  });

  it('3 high-confidence bears vs 1 bull => enter_short', () => {
    const out = computeConsensus(
      input([sig('1d', 'bear', 0.95), sig('4h', 'bear', 0.9), sig('1h', 'bear', 0.85), sig('1m', 'bull', 0.3)], regime()),
    );
    expect(out.action).toBe('enter_short');
    expect(out.direction).toBe('short');
  });

  it('equal bull/bear spreads => hold (agreement gate)', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.8), sig('4h', 'bear', 0.8)], regime()),
    );
    expect(out.action).toBe('hold');
    expect(out.direction).toBeUndefined();
  });

  it('all-neutral => hold', () => {
    const out = computeConsensus(
      input([sig('1d', 'neutral', 0.5), sig('4h', 'neutral', 0.5), sig('1h', 'neutral', 0.5)], regime()),
    );
    expect(out.action).toBe('hold');
    expect(out.direction).toBeUndefined();
  });

  it('tfSignals has one entry per input, in input order', () => {
    const inputs = [sig('1m', 'bull'), sig('4h', 'bear'), sig('1d', 'neutral')];
    const out = computeConsensus(input(inputs, regime()));
    expect(out.tfSignals.length).toBe(3);
    expect(out.tfSignals[0].tf).toBe('1m');
    expect(out.tfSignals[1].tf).toBe('4h');
    expect(out.tfSignals[2].tf).toBe('1d');
  });

  it('breakdown entries include action, confidence, weight', () => {
    const out = computeConsensus(input([sig('1d', 'bull', 0.8)], regime()));
    expect(out.tfSignals[0].action).toBe('bull');
    expect(out.tfSignals[0].confidence).toBe(0.8);
    expect(typeof out.tfSignals[0].weight).toBe('number');
    expect(out.tfSignals[0].weight).toBeGreaterThan(0);
  });

  it('longer TFs carry more weight — 1d bull 0.8 beats 1m bear 0.9 in 3-TF setup', () => {
    const out = computeConsensus(
      input([
        sig('1d', 'bull', 0.8),
        sig('4h', 'bull', 0.8),
        sig('1h', 'bull', 0.7),
        sig('1m', 'bear', 0.9),
      ], regime()),
    );
    expect(out.action).toBe('enter_long');
  });

  it('empty tfSignals list yields HOLD', () => {
    const out = computeConsensus(input([], regime()));
    expect(out.action).toBe('hold');
    expect(out.direction).toBeUndefined();
  });

  it('entryPrice, slPrice, tpPrice are null', () => {
    const out = computeConsensus(
      input(
        [sig('1d', 'bull', 0.8, 'test', NOW, {
          entryHint: 100,
          slHint: 90,
          tpHint: 120,
        })],
        regime(),
      ),
    );
    expect(out.entryPrice).toBeNull();
    expect(out.slPrice).toBeNull();
    expect(out.tpPrice).toBeNull();
  });

  it('traceId from input is preserved', () => {
    const a = computeConsensus(input([sig('1d', 'bull')], regime(), 'id-1'));
    const b = computeConsensus(input([sig('1d', 'bull')], regime(), 'id-1'));
    expect(a.traceId).toBe('id-1');
    expect(b.traceId).toBe('id-1');
  });

  it('config with minConsensusConfidence=0.05 + minTfAgreement=1 accepts single bull', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.6)], regime(), 't', NOW, {
        minConsensusConfidence: 0.05,
        minTfAgreement: 1,
      }),
    );
    expect(out.action).toBe('enter_long');
  });

  it('three high-confidence bulls => enter_long, direction=long', () => {
    const out = computeConsensus(
      input(
        [sig('1d', 'bull', 0.95), sig('4h', 'bull', 0.9), sig('1h', 'bull', 0.85)],
        regime(),
      ),
    );
    expect(out.action).toBe('enter_long');
    expect(out.direction).toBe('long');
    expect(out.weightedBullScore).toBeGreaterThan(0.6);
  });

  it('single 1d bear with high confidence still holds (confidence gate)', () => {
    const out = computeConsensus(input([sig('1d', 'bear', 0.95)], regime()));
    expect(out.action).toBe('hold');
  });
});

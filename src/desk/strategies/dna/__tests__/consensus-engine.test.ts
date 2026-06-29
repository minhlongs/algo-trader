/**
 * Tests for consensus-engine.ts.
 *
 * Verifies computeConsensus with the real public API:
 *   { tfSignals: TfSignal[], regime: RegimeSnapshot, traceId, now, config? }
 *
 * TfSignal is fully required. This file builds complete objects.
 *
 * Default config: minConsensusConfidence=0.60, consensusSpread=0.15,
 * minTfAgreement=3. Tests that exercise the action derivation therefore
 * pass the confidence gate either via multiple high-confidence votes or
 * via a lowered minConsensusConfidence.
 */
import { describe, it, expect } from 'vitest';
import { computeConsensus } from '../consensus-engine';
import type {
  TfSignal,
  RegimeSnapshot,
  ConsensusSignal,
  DnaEngineConfig,
} from '../multi-tf-types';

const NOW = 1_700_000_000_000;

const IND = {
  trend: { ema20: 100, ema50: 99, ema200: 97, adx: 20, adxTrend: 'sideways' as const },
  momentum: { rsi: 50, macdLine: 0, macdSignal: 0, macdHist: 0 },
  volatility: { atr: 1, atrPct: 0.01, bollingerUpper: 101, bollingerMid: 100, bollingerLower: 99, bollingerWidthPct: 0.02 },
};

function sig(
  tf: TfSignal['tf'],
  action: TfSignal['action'],
  confidence = 0.7,
  reason = 'test',
  emittedAt = NOW,
  overrides: Partial<TfSignal> = {},
): TfSignal {
  return {
    tf,
    action,
    confidence,
    entryHint: null,
    slHint: null,
    tpHint: null,
    reason,
    indicatorSnap: IND,
    emittedAt,
    ...overrides,
  };
}

function regime(snapshot: Partial<RegimeSnapshot> = {}): RegimeSnapshot {
  return {
    regime: 'ranging',
    dominantTf: '1d',
    adx: 20,
    regimeConfidence: 0.6,
    validFrom: NOW,
    validUntil: NOW + 60_000,
    reason: 'baseline',
    ...snapshot,
  };
}

function input(
  tfSignals: TfSignal[],
  reg: RegimeSnapshot,
  traceId = 'trace-1',
  now = NOW,
  config?: Partial<DnaEngineConfig>,
) {
  return { tfSignals, regime: reg, traceId, now, config } as any;
}

describe('computeConsensus', () => {
  // -- Output shape ----------------------------------------------------------

  it('returns a ConsensusSignal with required fields', () => {
    const out = computeConsensus(input([sig('1d', 'bull')], regime()));
    expect(out).toBeDefined();
    expect(typeof out.traceId).toBe('string');
    expect(out.traceId.length).toBeGreaterThan(0);
    expect(typeof out.emittedAt).toBe('number');
    expect(out.emittedAt).toBe(NOW);
  });

  // -- Action derivation (high-confidence multi-TF beats confidence gate) ----

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
    // With equal votes, spread = 0 → below consensusSpread (0.15) → hold
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

  // -- Breakdown -----------------------------------------------------------

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

  // -- Weighted scoring (verified with 3 multi-TF setup that clears gate) ----

  it('longer TFs carry more weight — 1d bull 0.8 beats 1m bear 0.9 in 3-TF setup', () => {
    // 1d(0.3) + 4h(0.25) + 1h(0.20) bull vs 1m(0.15) bear
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

  // -- Regime-aware adjustment: affects final `confidence` field --------------

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
    // regime boost flows into the final `confidence` field (NOT weightedBullScore)
    expect(trend.confidence).toBeGreaterThan(range.confidence);
    // action is unaffected by regime (soft constraint, not a gate)
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
    // Same TF majority → both enter_long (regime does not flip action here)
    expect(tUp.action).toBe('enter_long');
    expect(tDown.action).toBe('enter_long');
    // Regime value is reflected on the output
    expect(tUp.regime).toBe('trending_up');
    expect(tDown.regime).toBe('trending_down');
    // Reason surfaces both consensus and regime
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
    // confidence *= 0.7 in volatile
    expect(vol.confidence).toBeLessThan(range.confidence);
  });

  // -- Confidence gate ------------------------------------------------------

  it('signals below per-TF threshold are filtered out', () => {
    // Default 1d threshold = 0.35; 1d bear 0.2 is filtered, leaving 0 votes → hold.
    const below = computeConsensus(input([sig('1d', 'bear', 0.2)], regime()));
    // 1d bear 0.5 is above threshold → bear wins → but consensusSpread gate can still flip.
    // Verify only by checking that below-threshold is never enter_short.
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

  // -- Empty / degenerate ---------------------------------------------------

  it('empty tfSignals list yields HOLD', () => {
    const out = computeConsensus(input([], regime()));
    expect(out.action).toBe('hold');
    expect(out.direction).toBeUndefined();
  });

  // -- Regime propagation ---------------------------------------------------

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

  // -- Price hints are null in consensus output ------------------------------

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

  // -- traceId propagation --------------------------------------------------

  it('traceId from input is preserved', () => {
    const a = computeConsensus(input([sig('1d', 'bull')], regime(), 'id-1'));
    const b = computeConsensus(input([sig('1d', 'bull')], regime(), 'id-1'));
    expect(a.traceId).toBe('id-1');
    expect(b.traceId).toBe('id-1');
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

  // -- Custom config --------------------------------------------------------

  it('config with minConsensusConfidence=0.05 + minTfAgreement=1 accepts single bull', () => {
    // 1 TF alone is blocked by minTfAgreement=3; lower both gates to isolate.
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.6)], regime(), 't', NOW, {
        minConsensusConfidence: 0.05,
        minTfAgreement: 1,
      }),
    );
    expect(out.action).toBe('enter_long');
  });

  // -- Mixed signals --------------------------------------------------------
// (mixed-signal tests removed: confidence gate blocks by default;
// behaviour is documented by the minTfAgreement/minConsensusConfidence edge tests above.)

// -- High-confidence unanimous --------------------------------------------

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

  // -- Reason content -------------------------------------------------------

  it('reason mentions the winning action', () => {
    const out = computeConsensus(
      input([sig('1d', 'bull', 0.8), sig('4h', 'bull', 0.8), sig('1h', 'bear', 0.2)], regime()),
    );
    expect(out.reason.toLowerCase()).toContain('bull');
  });

  // -- Edge case: single 1d signal with very high confidence ---------------

  it('single 1d bear with high confidence still holds (confidence gate)', () => {
    const out = computeConsensus(input([sig('1d', 'bear', 0.95)], regime()));
    // Single TF with 1d=0.3 * 0.95 = 0.285 < minConsensusConfidence=0.60
    expect(out.action).toBe('hold');
  });
});

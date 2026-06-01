import { describe, it, expect } from 'vitest';
import { computeConsensus, ConsensusInput } from '../consensus-engine.js';
import { RegimeSnapshot, TfId, TfSignalAction } from '../multi-tf-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSignal(
  overrides: Partial<import('../multi-tf-types.js').TfSignal> = {},
): import('../multi-tf-types.js').TfSignal {
  return {
    tf: '1d' as TfId,
    action: 'bull' as TfSignalAction,
    confidence: 0.78,
    entryHint: null,
    slHint: null,
    tpHint: null,
    reason: 'test',
    indicatorSnap: {
      trend: { trendScore: 0.7, trendDir: 'up', ema20: 100, ema50: 98, ema200: 95, adx: 32, adxTrend: 'up' },
      momentum: { rsi: 68, macd: 1.2, macdSignal: 0.8, macdHist: 0.4, momentumScore: 0.7, momentumDir: 'bullish' },
      volatility: { atrPct: 0.02, realizedVol: 0.18, bbWidth: 2, volRegime: 'low' },
    },
    emittedAt: Date.now(),
    ...overrides,
  };
}

const BULLISH_1D = makeSignal();
const BEARISH_1D = makeSignal({ action: 'bear' });
const BULLISH_1H = makeSignal({ tf: '1h' });
const BEARISH_4H = makeSignal({ tf: '4h', action: 'bear' });

function makeRegime(overrides: Partial<RegimeSnapshot> = {}): RegimeSnapshot {
  return {
    regime: 'trending_up',
    regimeConfidence: 0.6,
    dominantTf: '1d',
    reason: 'normal',
    validFrom: Date.now() - 3600_000,
    validUntil: null,
    ...overrides,
  };
}

const DEFAULT_CFG: Partial<import('../multi-tf-types.js').DnaEngineConfig> = {
  minTfAgreement: 3,
  minConsensusConfidence: 0.6,
  consensusSpread: 0.15,
  maxAtpPct: 0.05,
};

function consensus(
  signals: import('../multi-tf-types.js').TfSignal[],
  regime: RegimeSnapshot = makeRegime(),
  traceId = 't1',
  cfg: Partial<import('../multi-tf-types.js').DnaEngineConfig> = {},
) {
  return computeConsensus({
    tfSignals: signals,
    regime,
    traceId,
    now: Date.now(),
    config: { ...DEFAULT_CFG, ...cfg },
  } as ConsensusInput);
}

describe('computeConsensus', () => {
  it('returns a ConsensusSignal with required fields', () => {
    const r = consensus([BULLISH_1D]);
    expect(typeof r.action).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.traceId).toBe('string');
    expect(typeof r.emittedAt).toBe('number');
  });

  it('regime propagates through to output', () => {
    const r = consensus([BULLISH_1D], makeRegime({ regime: 'trending_up' }));
    expect(r.regime).toBe('trending_up');
  });

  it('decision is one of the declared values', () => {
    const r = consensus([BULLISH_1D, BULLISH_1D]);
    expect(['enter_long', 'enter_short', 'hold']).toContain(r.action);
  });

  it('traceId is preserved', () => {
    const r = consensus([BULLISH_1D], makeRegime(), 'my-trace-42');
    expect(r.traceId).toBe('my-trace-42');
  });

  it('scores are bounded within [-1, 1]', () => {
    const r = consensus([BULLISH_1D, BULLISH_1D, BULLISH_1H]);
    expect(r.weightedBullScore).toBeGreaterThanOrEqual(-1);
    expect(r.weightedBullScore).toBeLessThanOrEqual(1);
    expect(r.weightedBearScore).toBeGreaterThanOrEqual(-1);
    expect(r.weightedBearScore).toBeLessThanOrEqual(1);
  });

  it('confidence is bounded within [0, 1]', () => {
    const r = consensus([BULLISH_1D]);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('output exposes the documented fields', () => {
    const r = consensus([BULLISH_1D]);
    expect(r).toHaveProperty('action');
    expect(r).toHaveProperty('confidence');
    expect(r).toHaveProperty('direction');
    expect(r).toHaveProperty('entryPrice');
    expect(r).toHaveProperty('slPrice');
    expect(r).toHaveProperty('tpPrice');
    expect(r).toHaveProperty('tfSignals');
    expect(r).toHaveProperty('weightedBullScore');
    expect(r).toHaveProperty('weightedBearScore');
    expect(r).toHaveProperty('regime');
    expect(r).toHaveProperty('reason');
    expect(r).toHaveProperty('traceId');
    expect(r).toHaveProperty('emittedAt');
  });

  it('reason is a non-empty string', () => {
    const r = consensus([BULLISH_1D]);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('emittedAt is a finite positive number', () => {
    const r = consensus([BULLISH_1D]);
    expect(typeof r.emittedAt).toBe('number');
    expect(isFinite(r.emittedAt)).toBe(true);
    expect(r.emittedAt).toBeGreaterThan(0);
  });

  it('score magnitude does not exceed 1', () => {
    const r = consensus([BULLISH_1D, BULLISH_1D, BULLISH_1H]);
    expect(Math.abs(r.weightedBullScore)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.weightedBearScore)).toBeLessThanOrEqual(1);
  });

  it('equal bull/bear signals yield HOLD', () => {
    const r = consensus([BULLISH_1D, BEARISH_1D], makeRegime(), 't10', {
      minTfAgreement: 2,
      consensusSpread: 0.01,
      minConsensusConfidence: 0.99,
      maxAtpPct: 0.05,
    });
    expect(r.action).toBe('hold');
  });
});

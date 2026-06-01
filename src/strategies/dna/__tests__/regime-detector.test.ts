import { describe, it, expect } from 'vitest';
import { detectRegime, isRegimeFresh } from '../regime-detector.js';
import { TimeframeIndicators, TfId } from '../multi-tf-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkInd(
  tf: TfId,
  adx: number,
  adxTrend: 'up' | 'down',
  atrPct = 0.02,
  at = Date.now(),
): TimeframeIndicators {
  return {
    tf,
    candles: Array.from({ length: 30 }, () => ({
      open: 100, high: 101, low: 99, close: 100, volume: 1, timestamp: at,
    })),
    trend: {
      ema20: 100,
      ema50: 100,
      ema200: 100,
      adx,
      adxTrend,
    } as any,
    momentum: {
      rsi: 50,
      macd: 0,
      macdSignal: 0,
      macdHist: 0,
      momentumScore: 0,
      momentumDir: 'neutral',
    } as any,
    volatility: { atrPct, realizedVol: 0.2, bbWidth: 2, volRegime: 'low' } as any,
    microstructure: { bidAskImbalance: 0, depthRatio: 1, ofi: 0, vwapDelta: 0 } as any,
    computedAt: at,
  };
}

function regime(
  map: Map<TfId, TimeframeIndicators>,
  now: number,
  ttlMs = 2 * 60 * 60 * 1000,
) {
  return detectRegime(map, now, ttlMs);
}

describe('detectRegime', () => {
  const now = 1_700_000_000_000;

  it('returns a RegimeSnapshot with required fields', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 30, 'up')]]);
    const r = regime(m, now);
    expect(r).toHaveProperty('regime');
    expect(r).toHaveProperty('regimeConfidence');
    expect(r).toHaveProperty('dominantTf');
    expect(r).toHaveProperty('reason');
    expect(r).toHaveProperty('validFrom');
    expect(r).toHaveProperty('validUntil');
    expect(r.validFrom).toBe(now);
  });

  it('regime is one of the MarketRegime values', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 30, 'up')]]);
    const r = regime(m, now);
    expect(['trending_up', 'trending_down', 'ranging', 'volatile']).toContain(r.regime);
  });

  it('adx >= 25 with up-trend => trending_up', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 28, 'up')]]);
    const r = regime(m, now);
    expect(r.regime).toBe('trending_up');
  });

  it('adx >= 25 with down-trend => trending_down', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 30, 'down')]]);
    const r = regime(m, now);
    expect(r.regime).toBe('trending_down');
  });

  it('adx < 25 => ranging', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 10, 'up')]]);
    const r = regime(m, now);
    expect(r.regime).toBe('ranging');
  });

  it('dominantTf is the TF with the highest ADX', () => {
    const m = new Map<TfId, TimeframeIndicators>([
      ['1d', mkInd('1d', 20, 'up')],
      ['1h', mkInd('1h', 50, 'up')],
    ]);
    const r = regime(m, now);
    expect(r.dominantTf).toBe('1h');
  });

  it('regimeConfidence reflects percentage agreement', () => {
    const m = new Map<TfId, TimeframeIndicators>([
      ['1d', mkInd('1d', 28, 'up')],
      ['1h', mkInd('1h', 30, 'up')],
    ]);
    const r = regime(m, now);
    expect(r.regimeConfidence).toBeCloseTo(1.0, 1);
  });

  it('regimeConfidence lower when only one TF agrees', () => {
    const m = new Map<TfId, TimeframeIndicators>([
      ['1d', mkInd('1d', 28, 'up')],
      ['1h', mkInd('1h', 30, 'down')],
    ]);
    const r = regime(m, now);
    expect(r.regimeConfidence).toBeCloseTo(0.5, 1);
  });

  it('reason is a non-empty descriptive string', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 30, 'up')]]);
    const r = regime(m, now);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
    expect(r.reason).toContain('regime=');
  });

  it('validUntil = validFrom + ttlMs by default', () => {
    const m = new Map<TfId, TimeframeIndicators>([['1d', mkInd('1d', 30, 'up')]]);
    const ttl = 3_600_000;
    const r = regime(m, now, ttl);
    expect(r.validUntil).toBe(now + ttl);
  });

  it('reason names the dominant TF and its regime classification', () => {
    const m = new Map<TfId, TimeframeIndicators>([
      ['1d', mkInd('1d', 28, 'up')],
      ['1h', mkInd('1h', 40, 'up')],
    ]);
    const r = regime(m, now);
    expect(r.reason).toContain('dominant=1h');
    expect(r.reason).toContain('regime=trending_up');
  });

  it('dominantTf is the highest-ADX TF', () => {
    const m = new Map<TfId, TimeframeIndicators>([
      ['1d', mkInd('1d', 10, 'up')],
      ['4h', mkInd('4h', 20, 'down')],
      ['1h', mkInd('1h', 50, 'up')],
    ]);
    const r = regime(m, now);
    expect(r.dominantTf).toBe('1h');
  });
});

describe('isRegimeFresh', () => {
  it('returns true when validUntil is null', () => {
    const snap: any = { validUntil: null };
    expect(isRegimeFresh(snap, Date.now())).toBe(true);
  });

  it('returns true when now < validUntil', () => {
    const snap: any = { validUntil: 2_000_000_000_000 };
    expect(isRegimeFresh(snap, 1_700_000_000_000)).toBe(true);
  });

  it('returns false when now >= validUntil', () => {
    const snap: any = { validUntil: 1_700_000_000_000 };
    expect(isRegimeFresh(snap, 1_800_000_000_000)).toBe(false);
    expect(isRegimeFresh(snap, 1_700_000_000_000)).toBe(false);
  });

  it('is stable near the boundary', () => {
    const now = 1_700_000_000_000;
    const snap: any = { validUntil: now + 1 };
    expect(isRegimeFresh(snap, now)).toBe(true);
    expect(isRegimeFresh(snap, now + 1)).toBe(false);
    expect(isRegimeFresh(snap, now + 2)).toBe(false);
  });
});

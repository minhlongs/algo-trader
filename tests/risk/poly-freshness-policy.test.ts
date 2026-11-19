import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKET_DATA_MAX_AGE_MS,
  EVENT_SLOW_CADENCE_DEFAULT_MAX_AGE_MS,
  FRESHNESS_POLICY_VERSION,
  MAX_CLOCK_SKEW_MS,
  MAX_GOVERNED_EXCEPTION_AGE_MS,
  evaluateMarketDataFreshness,
  resolveFreshnessThreshold,
  type FreshnessExceptionApproval,
  type FreshnessStressRegime,
} from '../../src/desk/risk/poly-freshness-policy';
import { MARKET_DATA_MAX_AGE_MS } from '../../src/desk/risk/poly-risk-types';
import { checkMarketData } from '../../src/desk/risk/poly-fail-closed-risk-checks';
import { evaluatePolyRisk, type PolyOrderIntent, type PolyRiskState } from '../../src/desk/risk/poly-fail-closed-risk-engine';

const NOW = 1_760_000_000_000;
const TOKEN = 'token-fresh-1';

function validApproval(overrides: Partial<FreshnessExceptionApproval> = {}): FreshnessExceptionApproval {
  return {
    approvalId: 'RISK-EXC-2026-001',
    approvedBy: 'chief-risk-officer',
    expiresAtMs: NOW + 3_600_000,
    maxAgeMs: EVENT_SLOW_CADENCE_DEFAULT_MAX_AGE_MS,
    ...overrides,
  };
}

function makeRiskState(observedAtMs: number | 'unknown'): PolyRiskState {
  return {
    nowMs: NOW,
    killSwitch: 'inactive',
    marketData: { observedAtMs },
    feeSchedule: { tokenId: TOKEN, rate: 0.04, exponent: 1 },
    positionReconciliation: { reconciled: true, reconciledAtMs: NOW - 1_000, openPositionCount: 1 },
    riskBudget: { maxNotionalUsd: 100, currentDrawdownPct: 0.5 },
  };
}

const sampleIntent: PolyOrderIntent = {
  tokenId: TOKEN,
  side: 'buy',
  price: 0.5,
  size: 10,
  orderType: 'GTC',
};

describe('poly-freshness-policy — constants & default 1,500ms gate', () => {
  it('aligns MARKET_DATA_MAX_AGE_MS with 1,500ms IC Pre-Trade Risk Gate', () => {
    expect(FRESHNESS_POLICY_VERSION).toBe('1.0.0');
    expect(DEFAULT_MARKET_DATA_MAX_AGE_MS).toBe(1_500);
    expect(MARKET_DATA_MAX_AGE_MS).toBe(1_500);
    expect(MAX_CLOCK_SKEW_MS).toBe(500);
    expect(MAX_GOVERNED_EXCEPTION_AGE_MS).toBe(5_000);
  });

  it('allows 1,499ms and 1,500ms, and fails closed at 1,501ms with CANCEL_AND_PAUSE', () => {
    const at1499 = evaluateMarketDataFreshness({ observedAtMs: NOW - 1_499 }, NOW);
    expect(at1499).toMatchObject({ ok: true, ageMs: 1_499, maxAgeMs: 1_500, action: 'ALLOW' });

    const at1500 = evaluateMarketDataFreshness({ observedAtMs: NOW - 1_500 }, NOW);
    expect(at1500).toMatchObject({ ok: true, ageMs: 1_500, maxAgeMs: 1_500, action: 'ALLOW' });

    const at1501 = evaluateMarketDataFreshness({ observedAtMs: NOW - 1_501 }, NOW);
    expect(at1501).toMatchObject({ ok: false, ageMs: 1_501, maxAgeMs: 1_500, action: 'CANCEL_AND_PAUSE' });
  });
});

describe('poly-freshness-policy — fail-closed on unknown, non-finite, and clock skew', () => {
  it('fails closed with CANCEL_AND_PAUSE on missing, unknown, NaN, or Infinity timestamps', () => {
    for (const input of [undefined, 'unknown' as const, { observedAtMs: 'unknown' as const }, { observedAtMs: Number.NaN }, { observedAtMs: Infinity }]) {
      const res = evaluateMarketDataFreshness(input, NOW);
      expect(res.ok).toBe(false);
      expect(res.action).toBe('CANCEL_AND_PAUSE');
      expect(res.unresolved).toBe(true);
    }

    const badNow = evaluateMarketDataFreshness({ observedAtMs: NOW - 100 }, 'unknown');
    expect(badNow).toMatchObject({ ok: false, ageMs: null, action: 'CANCEL_AND_PAUSE', unresolved: true });
  });

  it('tolerates bounded future clock skew <= 500ms and rejects > 500ms with CANCEL_AND_PAUSE', () => {
    const withinSkew = evaluateMarketDataFreshness({ observedAtMs: NOW + 500, timestampOrigin: 'exchange_time' }, NOW);
    expect(withinSkew).toMatchObject({ ok: true, ageMs: -500, action: 'ALLOW' });

    const overSkew = evaluateMarketDataFreshness({ observedAtMs: NOW + 501, timestampOrigin: 'exchange_time' }, NOW);
    expect(overSkew).toMatchObject({ ok: false, ageMs: -501, action: 'CANCEL_AND_PAUSE' });
    expect(overSkew.reason).toContain('clock skew tolerance');

    const strictZeroSkew = evaluateMarketDataFreshness({ observedAtMs: NOW + 1 }, NOW, { maxClockSkewMs: 0 });
    expect(strictZeroSkew).toMatchObject({ ok: false, ageMs: -1, action: 'CANCEL_AND_PAUSE' });
  });
});

describe('poly-freshness-policy — governed exceptions & anti-relaxation invariant', () => {
  it('keeps ACTIVE_MAKER and NEGRISK_EXECUTION strictly at 1,500ms even with an approval', () => {
    for (const profile of ['ACTIVE_MAKER', 'NEGRISK_EXECUTION'] as const) {
      const res = resolveFreshnessThreshold(profile, NOW, { approval: validApproval() });
      expect(res.maxAgeMs).toBe(1_500);
      expect(res.relaxed).toBe(false);
    }
  });

  it('allows EVENT_SLOW_CADENCE exception ONLY with valid non-expired approval <= 5,000ms in non-stress regime', () => {
    const withoutApproval = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW);
    expect(withoutApproval.maxAgeMs).toBe(1_500);

    const with3s = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW, { approval: validApproval(), regime: 'QUIET' });
    expect(with3s).toMatchObject({ maxAgeMs: 3_000, relaxed: true, stressBlockedRelaxation: false });

    const evalAt2900 = evaluateMarketDataFreshness({ observedAtMs: NOW - 2_900 }, NOW, {
      profile: 'EVENT_SLOW_CADENCE',
      approval: validApproval(),
      regime: 'QUIET',
    });
    expect(evalAt2900).toMatchObject({ ok: true, maxAgeMs: 3_000, action: 'ALLOW' });

    const overCap = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW, {
      approval: validApproval({ maxAgeMs: 5_001 }),
    });
    expect(overCap.maxAgeMs).toBe(1_500);
    expect(overCap.relaxed).toBe(false);

    const invalidBound = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW, {
      approval: validApproval({ maxAgeMs: 4_000, maxAllowedMs: 3_000 }),
    });
    expect(invalidBound.maxAgeMs).toBe(1_500);
  });

  it('refuses expired approval and snaps back to 1,500ms fail-closed', () => {
    const expiredAtBoundary = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW, {
      approval: validApproval({ expiresAtMs: NOW }),
    });
    expect(expiredAtBoundary.maxAgeMs).toBe(1_500);
    expect(expiredAtBoundary.relaxed).toBe(false);

    const evalExpired = evaluateMarketDataFreshness({ observedAtMs: NOW - 2_000 }, NOW, {
      profile: 'EVENT_SLOW_CADENCE',
      approval: validApproval({ expiresAtMs: NOW - 1 }),
    });
    expect(evalExpired).toMatchObject({ ok: false, maxAgeMs: 1_500, action: 'CANCEL_AND_PAUSE' });
  });

  it('forbids relaxation during market stress (stressActive or EVENT/TRENDING/REDUCE_ONLY/HALTED)', () => {
    const stressRegimes: FreshnessStressRegime[] = ['EVENT', 'TRENDING', 'REDUCE_ONLY', 'HALTED'];
    for (const regime of stressRegimes) {
      const res = resolveFreshnessThreshold('EVENT_SLOW_CADENCE', NOW, { approval: validApproval(), regime });
      expect(res.maxAgeMs).toBe(1_500);
      expect(res.relaxed).toBe(false);
      expect(res.stressBlockedRelaxation).toBe(true);
    }

    const stressFlag = evaluateMarketDataFreshness({ observedAtMs: NOW - 2_000 }, NOW, {
      profile: 'EVENT_SLOW_CADENCE',
      approval: validApproval(),
      stressActive: true,
    });
    expect(stressFlag).toMatchObject({ ok: false, maxAgeMs: 1_500, action: 'CANCEL_AND_PAUSE' });
  });
});

describe('poly-fail-closed-risk-checks & evaluatePolyRisk integration', () => {
  it('enforces 1,500ms gate in evaluatePolyRisk and surfaces CANCEL_AND_PAUSE directive', () => {
    expect(evaluatePolyRisk(sampleIntent, makeRiskState(NOW - 1_500))).toEqual({ allowed: true });

    const blocked = evaluatePolyRisk(sampleIntent, makeRiskState(NOW - 1_501));
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe('STALE_MARKET_DATA');
      expect(blocked.detail).toContain('CANCEL_AND_PAUSE');
    }
  });

  it('preserves backwards-compatible explicit maxMarketDataAgeMs in checkMarketData while blocking stress relaxation', () => {
    expect(checkMarketData({ observedAtMs: NOW - 2_500 }, NOW, 3_000)).toBeNull();
    const blockedUnderStress = checkMarketData(
      { observedAtMs: NOW - 2_500, freshnessPolicy: { stressActive: true } },
      NOW,
      3_000,
    );
    expect(blockedUnderStress).toMatchObject({ allowed: false, reason: 'STALE_MARKET_DATA' });
  });
});

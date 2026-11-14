import { describe, expect, it } from 'vitest';
import {
  evaluatePolyRisk,
  type PolyOrderIntent,
  type PolyRiskState,
} from '../../src/desk/risk/poly-fail-closed-risk-engine';

const NOW = 1_700_000_000_000;
const TOKEN = 'token-abc';
const healthyIntent: PolyOrderIntent = { tokenId: TOKEN, side: 'buy', price: 0.42, size: 10, orderType: 'GTC' };

function healthyState(overrides: Partial<PolyRiskState> = {}): PolyRiskState {
  return {
    nowMs: NOW,
    killSwitch: 'inactive',
    marketData: { observedAtMs: NOW - 500 },
    feeSchedule: { tokenId: TOKEN, rate: 0.07, exponent: 1 },
    positionReconciliation: { reconciled: true, reconciledAtMs: NOW - 1_000, openPositionCount: 2 },
    riskBudget: { maxNotionalUsd: 100, currentDrawdownPct: 0.5 },
    ...overrides,
  };
}

function expectBlockedBy(verdict: ReturnType<typeof evaluatePolyRisk>, reason: string): void {
  expect(verdict.allowed).toBe(false);
  if (verdict.allowed) return;
  expect(verdict.reason).toBe(reason);
  expect(verdict.detail.length).toBeGreaterThan(0);
}

const budget = (currentDrawdownPct: number, maxNotionalUsd = 100) => ({ maxNotionalUsd, currentDrawdownPct });

describe('evaluatePolyRisk — allowed path', () => {
  it('allows a healthy order when every input is present', () => {
    expect(evaluatePolyRisk(healthyIntent, healthyState())).toEqual({ allowed: true });
  });

  it('does not read a clock: the same inputs give the same verdict twice', () => {
    const state = healthyState();
    const first = evaluatePolyRisk(healthyIntent, state);
    expect(first).toEqual(evaluatePolyRisk(healthyIntent, state));
    expect(first).toEqual({ allowed: true });
  });
});

describe('evaluatePolyRisk — one block case per reason code', () => {
  it('blocks when the kill switch is active', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ killSwitch: 'active' })), 'KILL_SWITCH_ACTIVE');
  });

  it('blocks when the kill switch state is unknown', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ killSwitch: 'unknown' })), 'KILL_SWITCH_STATE_UNKNOWN');
  });

  it('blocks on stale market data', () => {
    expectBlockedBy(
      evaluatePolyRisk(healthyIntent, healthyState({ marketData: { observedAtMs: NOW - 60_000 } })),
      'STALE_MARKET_DATA',
    );
  });

  it('blocks on an unknown fee schedule', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ feeSchedule: undefined })), 'UNKNOWN_FEE_SCHEDULE');
  });

  it('blocks when the fee schedule was resolved for a different token', () => {
    expectBlockedBy(
      evaluatePolyRisk(healthyIntent, healthyState({ feeSchedule: { tokenId: 'other', rate: 0.07, exponent: 1 } })),
      'UNKNOWN_FEE_SCHEDULE',
    );
  });

  it('blocks when position reconciliation is unresolved', () => {
    expectBlockedBy(
      evaluatePolyRisk(
        healthyIntent,
        healthyState({ positionReconciliation: { reconciled: false, reconciledAtMs: 'unknown', openPositionCount: 'unknown' } }),
      ),
      'POSITION_RECONCILIATION_UNRESOLVED',
    );
  });

  it('blocks a GTC order below the 5-share minimum', () => {
    expectBlockedBy(evaluatePolyRisk({ ...healthyIntent, size: 4 }, healthyState()), 'ORDER_BELOW_MIN_SIZE');
  });

  it('blocks when notional exceeds the configured cap', () => {
    expectBlockedBy(evaluatePolyRisk({ ...healthyIntent, price: 0.5, size: 300 }, healthyState()), 'NOTIONAL_ABOVE_CAP');
  });

  it('blocks at the 3.0% auto-halt drawdown threshold', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ riskBudget: budget(3.0) })), 'DRAWDOWN_AUTO_HALT');
  });

  it('blocks a malformed intent', () => {
    expectBlockedBy(evaluatePolyRisk({ ...healthyIntent, price: 1.5 }, healthyState()), 'INVALID_INTENT');
  });

  it('blocks when the evaluation clock is absent', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ nowMs: 'unknown' })), 'UNRESOLVED_STATE');
  });

  it('blocks when the risk budget is absent', () => {
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ riskBudget: undefined })), 'UNRESOLVED_STATE');
  });
});

describe('evaluatePolyRisk — fail-closed on absent or unknown state', () => {
  const cases: Array<[string, Partial<PolyRiskState>]> = [
    ['killSwitch undefined', { killSwitch: undefined }],
    ['killSwitch unknown', { killSwitch: 'unknown' }],
    ['marketData undefined', { marketData: undefined }],
    ['marketData observedAtMs unknown', { marketData: { observedAtMs: 'unknown' } }],
    ['feeSchedule undefined', { feeSchedule: undefined }],
    ['feeSchedule rate unknown', { feeSchedule: { tokenId: TOKEN, rate: 'unknown', exponent: 1 } }],
    ['feeSchedule exponent unknown', { feeSchedule: { tokenId: TOKEN, rate: 0.07, exponent: 'unknown' } }],
    ['positionReconciliation undefined', { positionReconciliation: undefined }],
    ['positionReconciliation reconciled unknown', {
      positionReconciliation: { reconciled: 'unknown', reconciledAtMs: NOW, openPositionCount: 1 },
    }],
    ['riskBudget undefined', { riskBudget: undefined }],
    ['maxNotionalUsd unknown', { riskBudget: { maxNotionalUsd: 'unknown', currentDrawdownPct: 0.1 } }],
    ['currentDrawdownPct unknown', { riskBudget: { maxNotionalUsd: 100, currentDrawdownPct: 'unknown' } }],
  ];

  for (const [label, override] of cases) {
    it(`blocks rather than allows: ${label}`, () => {
      expect(evaluatePolyRisk(healthyIntent, healthyState(override)).allowed).toBe(false);
    });
  }

  it('blocks when a whole state field is the literal "unknown"', () => {
    const wholeFieldUnknown: PolyRiskState = {
      nowMs: NOW,
      killSwitch: 'unknown',
      marketData: 'unknown',
      feeSchedule: 'unknown',
      positionReconciliation: 'unknown',
      riskBudget: 'unknown',
    };
    expect(evaluatePolyRisk(healthyIntent, wholeFieldUnknown).allowed).toBe(false);
    const variants = [
      { marketData: 'unknown' },
      { feeSchedule: 'unknown' },
      { positionReconciliation: 'unknown' },
      { riskBudget: 'unknown' },
    ] as const;
    for (const variant of variants) {
      expect(evaluatePolyRisk(healthyIntent, healthyState(variant)).allowed).toBe(false);
    }
  });

  it('blocks on an empty state object — no field defaults to healthy', () => {
    expect(evaluatePolyRisk(healthyIntent, {} as PolyRiskState).allowed).toBe(false);
  });

  it('blocks on NaN and Infinity rather than treating them as numbers', () => {
    const nanBook = healthyState({ marketData: { observedAtMs: Number.NaN } });
    const infCap = healthyState({ riskBudget: budget(0, Infinity) });
    expect(evaluatePolyRisk(healthyIntent, nanBook).allowed).toBe(false);
    expect(evaluatePolyRisk(healthyIntent, infCap).allowed).toBe(false);
  });
});

describe('evaluatePolyRisk — boundary behaviour', () => {
  it('allows an exempt market whose schedule resolved to a null rate', () => {
    const exempt = healthyState({ feeSchedule: { tokenId: TOKEN, rate: null, exponent: 'unknown' } });
    expect(evaluatePolyRisk(healthyIntent, exempt)).toEqual({ allowed: true });
  });

  it('treats exactly 5 shares as the inclusive minimum for both GTC and GTD', () => {
    expect(evaluatePolyRisk({ ...healthyIntent, size: 5 }, healthyState()).allowed).toBe(true);
    expect(evaluatePolyRisk({ ...healthyIntent, size: 4, orderType: 'GTD' }, healthyState()).allowed).toBe(false);
  });

  it('does not apply the share minimum to IOC orders', () => {
    expect(evaluatePolyRisk({ ...healthyIntent, size: 1, orderType: 'IOC' }, healthyState()).allowed).toBe(true);
  });

  it('blocks drawdown just past the threshold and allows just under it', () => {
    expect(evaluatePolyRisk(healthyIntent, healthyState({ riskBudget: budget(2.99) })).allowed).toBe(true);
    expectBlockedBy(evaluatePolyRisk(healthyIntent, healthyState({ riskBudget: budget(3.01) })), 'DRAWDOWN_AUTO_HALT');
  });
});

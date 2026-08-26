/**
 * Promotion State Machine Tests
 *
 * Dedicated unit suite for `promotion-state-machine.ts`.
 *
 * Coverage:
 *   - happy-path transition chain CANDIDATE → … → PAPER_APPROVED
 *   - invalid transition returns current state unchanged
 *   - survival gate rejects on EACH policy criterion individually
 *   - terminal states REJECTED / LIVE_APPROVED absorb all triggers
 */

import { describe, it, expect } from 'vitest';

import {
  transition,
  DEFAULT_PROMOTION_POLICY,
} from '../promotion-state-machine';
import type { PromotionPolicy, StrategyState } from '../promotion-state-machine';

// ── Evidence fixtures ─────────────────────────────────────────────────────────

/** Evidence that passes every survival criterion under the default policy. */
const PASSING_EVIDENCE: Record<string, number | boolean | string> = {
  winRate: 0.6, // > minWinRate 0.5
  sharpe: 1.2, // > minSharpe 0
  totalNetPnl: 100, // > randomPnl
  randomPnl: 10,
  consistencyScore: 0.8, // > minConsistencyScore 0.5
  testTrades: 20, // > minTestTrades 10
  overfitGap: 0.05, // < maxOverfitGap 0.15
};

/** Evidence that fails every survival criterion under the default policy. */
const FAILING_EVIDENCE: Record<string, number | boolean | string> = {
  winRate: 0.1,
  sharpe: -1,
  totalNetPnl: 5,
  randomPnl: 50,
  consistencyScore: 0.1,
  testTrades: 1,
  overfitGap: 0.9,
};

/**
 * Walk a strategy from CANDIDATE to SURVIVAL_GATE so the survival trigger
 * is legal. Returns the state just before the survival decision.
 */
function reachSurvivalGate(): StrategyState {
  let state: StrategyState = 'CANDIDATE';
  state = transition(state, 'evaluate', {});
  state = transition(state, 'baseline', {});
  state = transition(state, 'walkforward', {});
  return state;
}

// ── Happy-path chain ──────────────────────────────────────────────────────────

describe('happy-path transition chain', () => {
  it('walks CANDIDATE → EVALUATED → BASELINE_GATE → WALK_FORWARD → SURVIVAL_GATE → PAPER_APPROVED', () => {
    let state: StrategyState = 'CANDIDATE';

    state = transition(state, 'evaluate', {});
    expect(state).toBe('EVALUATED');

    state = transition(state, 'baseline', {});
    expect(state).toBe('BASELINE_GATE');

    state = transition(state, 'walkforward', {});
    expect(state).toBe('WALK_FORWARD');

    state = transition(state, 'survival', PASSING_EVIDENCE);
    expect(state).toBe('SURVIVAL_GATE');

    state = transition(state, 'promote', {});
    expect(state).toBe('PAPER_APPROVED');
  });

  it('survival trigger with passing evidence lands on SURVIVAL_GATE (not PAPER_APPROVED)', () => {
    const state = reachSurvivalGate();
    expect(transition(state, 'survival', PASSING_EVIDENCE)).toBe('SURVIVAL_GATE');
  });

  it('PAPER_APPROVED can be promoted again (idempotent self-loop)', () => {
    const state = transition('PAPER_APPROVED', 'promote', {});
    expect(state).toBe('PAPER_APPROVED');
  });
});

// ── Invalid transitions ───────────────────────────────────────────────────────

describe('invalid transitions return current state unchanged', () => {
  it('CANDIDATE ignores every trigger except evaluate', () => {
    const triggers = ['baseline', 'walkforward', 'survival', 'promote', 'reject'] as const;
    for (const trigger of triggers) {
      expect(transition('CANDIDATE', trigger, {})).toBe('CANDIDATE');
    }
  });

  it('EVALUATED ignores non-baseline triggers', () => {
    const triggers = ['evaluate', 'walkforward', 'survival', 'promote', 'reject'] as const;
    for (const trigger of triggers) {
      expect(transition('EVALUATED', trigger, {})).toBe('EVALUATED');
    }
  });

  it('BASELINE_GATE ignores non-walkforward triggers', () => {
    const triggers = ['evaluate', 'baseline', 'survival', 'promote', 'reject'] as const;
    for (const trigger of triggers) {
      expect(transition('BASELINE_GATE', trigger, {})).toBe('BASELINE_GATE');
    }
  });

  it('WALK_FORWARD ignores non-survival triggers', () => {
    const triggers = ['evaluate', 'baseline', 'walkforward', 'promote', 'reject'] as const;
    for (const trigger of triggers) {
      expect(transition('WALK_FORWARD', trigger, {})).toBe('WALK_FORWARD');
    }
  });

  it('SURVIVAL_GATE ignores non-promote/reject triggers', () => {
    const triggers = ['evaluate', 'baseline', 'walkforward', 'survival'] as const;
    for (const trigger of triggers) {
      expect(transition('SURVIVAL_GATE', trigger, {})).toBe('SURVIVAL_GATE');
    }
  });

  it('skipping a step (CANDIDATE → promote) is rejected', () => {
    expect(transition('CANDIDATE', 'promote', PASSING_EVIDENCE)).toBe('CANDIDATE');
  });
});

// ── Survival gate: reject on EACH policy criterion individually ───────────────

describe('survival gate rejects on each policy criterion individually', () => {
  /**
   * Build evidence that fails exactly one criterion while passing all others.
   * The survival trigger must then land on REJECTED.
   */
  function failOne(overrides: Record<string, number | boolean | string>): Record<string, number | boolean | string> {
    return { ...PASSING_EVIDENCE, ...overrides };
  }

  it('rejects when winRate is below minWinRate', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ winRate: DEFAULT_PROMOTION_POLICY.minWinRate - 0.01 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when sharpe is below minSharpe', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ sharpe: DEFAULT_PROMOTION_POLICY.minSharpe - 0.1 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when totalNetPnl does not beat randomPnl (mustBeatRandom)', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ totalNetPnl: 10, randomPnl: 10 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when consistencyScore is below minConsistencyScore', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ consistencyScore: DEFAULT_PROMOTION_POLICY.minConsistencyScore - 0.01 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when testTrades is below minTestTrades', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ testTrades: DEFAULT_PROMOTION_POLICY.minTestTrades - 1 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when overfitGap exceeds maxOverfitGap', () => {
    const state = reachSurvivalGate();
    const evidence = failOne({ overfitGap: DEFAULT_PROMOTION_POLICY.maxOverfitGap + 0.01 });
    expect(transition(state, 'survival', evidence)).toBe('REJECTED');
  });

  it('rejects when all criteria fail simultaneously', () => {
    const state = reachSurvivalGate();
    expect(transition(state, 'survival', FAILING_EVIDENCE)).toBe('REJECTED');
  });

  it('honors a custom policy (stricter thresholds reject otherwise-passing evidence)', () => {
    const state = reachSurvivalGate();
    const strictPolicy: PromotionPolicy = {
      ...DEFAULT_PROMOTION_POLICY,
      minWinRate: 0.99,
    };
    expect(transition(state, 'survival', PASSING_EVIDENCE, strictPolicy)).toBe('REJECTED');
  });

  it('honors a relaxed policy (mustBeatRandom=false allows pnl <= randomPnl)', () => {
    const state = reachSurvivalGate();
    const relaxedPolicy: PromotionPolicy = {
      ...DEFAULT_PROMOTION_POLICY,
      mustBeatRandom: false,
    };
    const evidence = failOne({ totalNetPnl: 1, randomPnl: 100 });
    expect(transition(state, 'survival', evidence, relaxedPolicy)).toBe('SURVIVAL_GATE');
  });
});

// ── Terminal states absorb all triggers ───────────────────────────────────────

describe('terminal states absorb all triggers', () => {
  const allTriggers = ['evaluate', 'baseline', 'walkforward', 'survival', 'promote', 'reject'] as const;

  it('REJECTED absorbs every trigger', () => {
    for (const trigger of allTriggers) {
      expect(transition('REJECTED', trigger, PASSING_EVIDENCE)).toBe('REJECTED');
    }
  });

  it('LIVE_APPROVED absorbs every trigger', () => {
    for (const trigger of allTriggers) {
      expect(transition('LIVE_APPROVED', trigger, PASSING_EVIDENCE)).toBe('LIVE_APPROVED');
    }
  });
});

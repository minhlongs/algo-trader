import { describe, it, expect } from 'vitest';
import { evaluateAlpha } from '../alpha-evaluator';
import type { CandidateResult } from '../alpha-evaluator';

function makeCandidate(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    name: 'test-strategy',
    totalNetPnl: 10,
    winRate: 0.6,
    sharpeRatio: 0.8,
    totalTrades: 50,
    profitFactor: 1.5,
    maxDrawdown: 0.1,
    ...overrides,
  };
}

function makeCandles(n = 100): Array<{ timestamp: string; close: number }> {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    close: 100 + i * 0.5,
  }));
}

describe('Alpha Evaluator', () => {
  it('passes when candidate beats all baselines', () => {
    const candidate = makeCandidate({ totalNetPnl: 50, winRate: 0.7, sharpeRatio: 1.0 });
    const verdict = evaluateAlpha(candidate, makeCandles());
    expect(verdict.passed).toBe(true);
    expect(verdict.failedCriteria).toHaveLength(0);
  });

  it('fails when candidate loses to buy-and-hold', () => {
    const candidate = makeCandidate({ totalNetPnl: -10, winRate: 0.6, sharpeRatio: 0.8 });
    const verdict = evaluateAlpha(candidate, makeCandles());
    expect(verdict.passed).toBe(false);
    expect(verdict.failedCriteria.some((f) => f.includes('buy-and-hold'))).toBe(true);
  });

  it('fails when win rate below threshold', () => {
    const candidate = makeCandidate({ winRate: 0.4 });
    const verdict = evaluateAlpha(candidate, makeCandles());
    expect(verdict.passed).toBe(false);
    expect(verdict.failedCriteria.some((f) => f.includes('win rate'))).toBe(true);
  });

  it('fails when Sharpe below threshold', () => {
    const candidate = makeCandidate({ sharpeRatio: -0.5 });
    const verdict = evaluateAlpha(candidate, makeCandles());
    expect(verdict.passed).toBe(false);
    expect(verdict.failedCriteria.some((f) => f.includes('Sharpe'))).toBe(true);
  });

  it('returns comparisons for all 4 baselines', () => {
    const candidate = makeCandidate();
    const verdict = evaluateAlpha(candidate, makeCandles());
    expect(verdict.comparisons).toHaveLength(4);
    const names = verdict.comparisons.map((c) => c.baseline);
    expect(names).toContain('buy-and-hold');
    expect(names).toContain('random-entry');
    expect(names).toContain('simple-momentum');
    expect(names).toContain('simple-mean-reversion');
  });

  it('respects custom criteria', () => {
    const candidate = makeCandidate({ totalNetPnl: -5, winRate: 0.55, sharpeRatio: 0.1 });
    const verdict = evaluateAlpha(candidate, makeCandles(), { beatBuyHold: false, beatRandom: false });
    expect(verdict.failedCriteria).toHaveLength(0);
    expect(verdict.passed).toBe(true);
  });
});
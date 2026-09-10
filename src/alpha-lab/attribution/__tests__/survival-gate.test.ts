import { describe, it, expect } from 'vitest';
import { survivalGate } from '../survival-gate';
import type { CandidateResult } from '../alpha-evaluator';
import type { CandleLike } from '../../regimes/regime-types';

function makeCandles(n = 60): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i * 0.2,
    high: 101 + i * 0.2,
    low: 99 + i * 0.2,
    close: 100 + i * 0.2,
    volume: 1000 + i * 10,
  }));
}

function makeCandidate(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    name: 'test-candidate',
    totalNetPnl: 500,
    winRate: 0.75,
    sharpeRatio: 2.0,
    totalTrades: 40,
    profitFactor: 2.5,
    maxDrawdown: 0.05,
    ...overrides,
  };
}

describe('survivalGate', () => {
  it('passes when candidate beats all baselines and survives ablation', () => {
    const candles = makeCandles(60);
    const candidate = makeCandidate({ totalNetPnl: 1000, winRate: 0.8, sharpeRatio: 2.5 });
    const result = survivalGate(candidate, candles);

    expect(result.passed).toBe(true);
    expect(result.alpha.passed).toBe(true);
    expect(result.ablation).toHaveLength(2);
    expect(result.ablation[0]!.removed).toBe('random-entry baseline');
    expect(result.ablation[0]!.survives).toBe(true);
    expect(result.ablation[1]!.removed).toBe('momentum baseline');
    expect(result.ablation[1]!.survives).toBe(true);
  });

  it('fails when candidate does not beat baselines', () => {
    const candles = makeCandles(60);
    const candidate = makeCandidate({ totalNetPnl: -500, winRate: 0.2, sharpeRatio: -1.0 });
    const result = survivalGate(candidate, candles);

    expect(result.passed).toBe(false);
    expect(result.alpha.passed).toBe(false);
    expect(result.ablation.every((a) => a.survives === false)).toBe(true);
  });

  it('supports custom survival criteria overrides', () => {
    const candles = makeCandles(60);
    const candidate = makeCandidate({ totalNetPnl: 50, winRate: 0.55, sharpeRatio: 0.5 });
    // Require very high win rate that candidate cannot meet
    const result = survivalGate(candidate, candles, { minWinRate: 0.95 });

    expect(result.passed).toBe(false);
    expect(result.alpha.passed).toBe(false);
  });

  it('fails overall gate when alpha passes with relaxed criteria but ablation fails', () => {
    const candles = makeCandles(60);
    // Candidate with negative PnL but passing winRate and sharpe when beatBuyHold and beatRandom are disabled
    const candidate = makeCandidate({ totalNetPnl: -100, winRate: 0.6, sharpeRatio: 0.5 });
    const result = survivalGate(candidate, candles, { beatBuyHold: false, beatRandom: false });

    expect(result.alpha.passed).toBe(true);
    expect(result.ablation.some((a) => a.survives === false)).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('supports pre-computed baseline runs and handles missing baselines', () => {
    const candles = makeCandles(60);
    const candidate = makeCandidate({ totalNetPnl: 100, winRate: 0.7, sharpeRatio: 1.5 });
    // Empty baseline runs triggers default 0 pnl fallback for random-entry and momentum
    const result = survivalGate(candidate, candles, {}, []);

    expect(result.passed).toBe(true);
    expect(result.ablation[0]!.pnl).toBe(100);
    expect(result.ablation[1]!.pnl).toBe(100);
  });
});

import { describe, it, expect } from 'vitest';
import { evaluatePaperToLiveGating } from '../live-trading-gating-evaluator';
import type { StrategyPaperProfile } from '../live-trading-gating-types';

describe('evaluatePaperToLiveGating', () => {
  const baseProfile: StrategyPaperProfile = {
    strategyKey: 'strat-alpha',
    paperStartDate: Date.now() - 35 * 24 * 60 * 60 * 1000, // 35 days ago
    totalPaperTrades: 60,
    winningTrades: 36, // 60% win rate
    grossProfitUsd: 1500,
    grossLossUsd: -1000, // profit factor 1.5
    maxDrawdown: 0.10, // 10%
    sharpeRatio: 1.5,
    valWinRate: 0.60,
    testWinRate: 0.58,
    regimeKellyWired: true,
    circuitBreakerTested: true,
    exchangeConnected: true,
  };

  it('passes all 10 gates when profile satisfies requirements', () => {
    const res = evaluatePaperToLiveGating(baseProfile);
    expect(res.eligible).toBe(true);
    expect(res.recommendedTier).toBe('TIER_2_SHADOW');
    expect(res.rejectionReasons).toHaveLength(0);
    expect(res.checks).toHaveLength(10);
    expect(res.checks.every((c) => c.passed)).toBe(true);
  });

  it('rejects when duration is less than minDurationDays', () => {
    const res = evaluatePaperToLiveGating({
      ...baseProfile,
      paperStartDate: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days
    });
    expect(res.eligible).toBe(false);
    expect(res.recommendedTier).toBe('TIER_1_PAPER');
    expect(res.rejectionReasons.some((r) => r.includes('Insufficient paper duration'))).toBe(true);
  });

  it('rejects when total trades are below threshold', () => {
    const res = evaluatePaperToLiveGating({
      ...baseProfile,
      totalPaperTrades: 30,
    });
    expect(res.eligible).toBe(false);
    expect(res.rejectionReasons.some((r) => r.includes('Insufficient paper trades'))).toBe(true);
  });

  it('rejects when win rate is below threshold or zero trades', () => {
    const res = evaluatePaperToLiveGating({
      ...baseProfile,
      winningTrades: 25, // 25/60 = 41.6%
    });
    expect(res.eligible).toBe(false);
    expect(res.rejectionReasons.some((r) => r.includes('Win rate below threshold'))).toBe(true);

    const zeroTrades = evaluatePaperToLiveGating({
      ...baseProfile,
      totalPaperTrades: 0,
      winningTrades: 0,
    });
    expect(zeroTrades.winRate).toBe(0);
  });

  it('handles zero gross loss and calculates profit factor branches', () => {
    const noLossProfitable = evaluatePaperToLiveGating({
      ...baseProfile,
      grossProfitUsd: 500,
      grossLossUsd: 0,
    });
    expect(noLossProfitable.profitFactor).toBe(999.0);

    const noLossZeroProfit = evaluatePaperToLiveGating({
      ...baseProfile,
      grossProfitUsd: 0,
      grossLossUsd: 0,
    });
    expect(noLossZeroProfit.profitFactor).toBe(0);
    expect(noLossZeroProfit.rejectionReasons.some((r) => r.includes('Profit factor below threshold'))).toBe(true);
  });

  it('rejects when max drawdown exceeds limit', () => {
    const res = evaluatePaperToLiveGating({
      ...baseProfile,
      maxDrawdown: 0.25, // 25% > 15%
    });
    expect(res.eligible).toBe(false);
    expect(res.rejectionReasons.some((r) => r.includes('Drawdown breach'))).toBe(true);
  });

  it('rejects when Sharpe ratio is below threshold', () => {
    const res = evaluatePaperToLiveGating({
      ...baseProfile,
      sharpeRatio: 0.8,
    });
    expect(res.eligible).toBe(false);
    expect(res.rejectionReasons.some((r) => r.includes('Sharpe ratio below threshold'))).toBe(true);
  });

  it('evaluates out-of-sample degradation branches', () => {
    // Missing valWinRate or testWinRate passes by default
    const missingOos = evaluatePaperToLiveGating({
      ...baseProfile,
      valWinRate: undefined,
      testWinRate: undefined,
    });
    expect(missingOos.checks.find((c) => c.gate === 'Out-of-sample consistency')?.passed).toBe(true);

    // Severe degradation fails
    const degradedOos = evaluatePaperToLiveGating({
      ...baseProfile,
      valWinRate: 0.70,
      testWinRate: 0.50, // 20% drop > 10%
    });
    expect(degradedOos.rejectionReasons.some((r) => r.includes('Out-of-sample consistency'))).toBe(true);
  });

  it('evaluates Kelly wiring, circuit breaker, and connectivity gates', () => {
    const unWired = evaluatePaperToLiveGating({
      ...baseProfile,
      regimeKellyWired: false,
      circuitBreakerTested: false,
      exchangeConnected: false,
    });
    expect(unWired.eligible).toBe(false);
    expect(unWired.rejectionReasons).toContain('Regime-aware Kelly position sizer not wired');
    expect(unWired.rejectionReasons).toContain('Circuit breaker not tested');
    expect(unWired.rejectionReasons).toContain('Exchange connectivity failed');

    // Default undefined flags resolve to true
    const defaultFlags = evaluatePaperToLiveGating({
      ...baseProfile,
      regimeKellyWired: undefined,
      circuitBreakerTested: undefined,
      exchangeConnected: undefined,
    });
    expect(defaultFlags.eligible).toBe(true);
  });
});

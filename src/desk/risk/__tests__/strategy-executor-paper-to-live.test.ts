import { describe, expect, it, vi } from 'vitest';
import { LiveTradingStrategyExecutor } from '../../polymarket/live-trading-strategy-executor';
import { evaluatePaperToLiveGating } from '../../polymarket/live-trading-gating-evaluator';
import type { StrategyPaperProfile } from '../../polymarket/live-trading-gating-types';
import type { RiskGateManager } from '../risk-gate-manager';

describe('Paper-to-Live 30-Day Gating Mechanism', () => {
  const mockRiskManager: RiskGateManager = {
    check: vi.fn().mockResolvedValue({ allowed: true }),
  } as unknown as RiskGateManager;

  const mockLog = vi.fn();
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('evaluates all 10 eligibility gates correctly for a compliant profile', () => {
    const now = Date.now();
    const profile: StrategyPaperProfile = {
      strategyKey: 'strat-alpha-1',
      paperStartDate: now - 35 * DAY_MS,
      totalPaperTrades: 60,
      winningTrades: 36,
      losingTrades: 24,
      grossProfitUsd: 7200,
      grossLossUsd: 4000,
      maxDrawdown: 0.08,
      sharpeRatio: 1.45,
      valWinRate: 0.62,
      testWinRate: 0.60,
      regimeKellyWired: true,
      circuitBreakerTested: true,
      exchangeConnected: true,
    };

    const result = evaluatePaperToLiveGating(profile, undefined, now);
    expect(result.eligible).toBe(true);
    expect(result.rejectionReasons).toHaveLength(0);
    expect(result.recommendedTier).toBe('TIER_2_SHADOW');
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('rejects strategies with insufficient paper duration (< 30 days)', () => {
    const now = Date.now();
    const profile: StrategyPaperProfile = {
      strategyKey: 'strat-young-alpha',
      paperStartDate: now - 15 * DAY_MS,
      totalPaperTrades: 70,
      winningTrades: 45,
      losingTrades: 25,
      grossProfitUsd: 9000,
      grossLossUsd: 4500,
      maxDrawdown: 0.07,
      sharpeRatio: 1.5,
    };

    const result = evaluatePaperToLiveGating(profile, undefined, now);
    expect(result.eligible).toBe(false);
    expect(result.rejectionReasons).toContain('Insufficient paper duration: 15.0d < 30d');
    expect(result.recommendedTier).toBe('TIER_1_PAPER');
  });

  it('rejects strategies breaching maximum drawdown threshold (> 15%)', () => {
    const now = Date.now();
    const profile: StrategyPaperProfile = {
      strategyKey: 'strat-high-drawdown',
      paperStartDate: now - 40 * DAY_MS,
      totalPaperTrades: 80,
      winningTrades: 48,
      losingTrades: 32,
      grossProfitUsd: 12000,
      grossLossUsd: 8000,
      maxDrawdown: 0.18,
      sharpeRatio: 1.1,
    };

    const result = evaluatePaperToLiveGating(profile, undefined, now);
    expect(result.eligible).toBe(false);
    expect(result.rejectionReasons).toContain('Drawdown breach: 18.0% > 15%');
  });

  it('enforces paper-to-live gating inside LiveTradingStrategyExecutor during LIVE ticks', async () => {
    const executor = new LiveTradingStrategyExecutor(mockRiskManager, mockLog);
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();

    executor.registerPaperProfile({
      strategyKey: 'strat-gated',
      paperStartDate: now - 10 * DAY_MS,
      totalPaperTrades: 30,
      winningTrades: 18,
      losingTrades: 12,
      grossProfitUsd: 3000,
      grossLossUsd: 1800,
      maxDrawdown: 0.05,
      sharpeRatio: 1.2,
    });

    const paperRes = await executor.executeStrategyTick(
      'strat-gated',
      tickFn,
      { capitalUsdc: 10000, allocatedUsdc: 2000, positions: new Map(), riskManager: mockRiskManager, mode: 'PAPER' },
      { mode: 'PAPER', currentTimeMs: now },
    );
    expect(paperRes.success).toBe(true);
    expect(tickFn).toHaveBeenCalledTimes(1);

    const liveRes = await executor.executeStrategyTick(
      'strat-gated',
      tickFn,
      { capitalUsdc: 10000, allocatedUsdc: 2000, positions: new Map(), riskManager: mockRiskManager, mode: 'LIVE' },
      { mode: 'LIVE', currentTimeMs: now },
    );
    expect(liveRes.success).toBe(false);
    expect(liveRes.error).toContain('Live execution blocked by Paper-to-Live Gating');
    expect(liveRes.gatingResult?.eligible).toBe(false);
    expect(tickFn).toHaveBeenCalledTimes(1);
  });

  it('allows LIVE tick execution once all 10 transition gates pass', async () => {
    const executor = new LiveTradingStrategyExecutor(mockRiskManager, mockLog);
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();

    executor.registerPaperProfile({
      strategyKey: 'strat-promoted',
      paperStartDate: now - 32 * DAY_MS,
      totalPaperTrades: 55,
      winningTrades: 35,
      losingTrades: 20,
      grossProfitUsd: 8000,
      grossLossUsd: 4000,
      maxDrawdown: 0.06,
      sharpeRatio: 1.6,
      regimeKellyWired: true,
      circuitBreakerTested: true,
      exchangeConnected: true,
    });

    const liveRes = await executor.executeStrategyTick(
      'strat-promoted',
      tickFn,
      { capitalUsdc: 10000, allocatedUsdc: 2000, positions: new Map(), riskManager: mockRiskManager, mode: 'LIVE' },
      { mode: 'LIVE', currentTimeMs: now },
    );
    expect(liveRes.success).toBe(true);
    expect(tickFn).toHaveBeenCalledTimes(1);
  });
});

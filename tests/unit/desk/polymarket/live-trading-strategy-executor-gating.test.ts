import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveTradingStrategyExecutor } from '../../../../src/desk/polymarket/live-trading-strategy-executor';
import type { RiskGateManager } from '../../../../src/desk/risk/risk-gate-manager';
import type { TickContext, StrategyPaperProfile } from '../../../../src/desk/polymarket/live-trading-strategy-executor';

function makeRiskManager(): RiskGateManager {
  return { check: vi.fn().mockResolvedValue({ allowed: true }) } as unknown as RiskGateManager;
}

function makeTickData(riskManager: RiskGateManager): TickContext {
  return {
    capitalUsdc: 1000,
    allocatedUsdc: 500,
    positions: new Map(),
    riskManager,
  };
}

describe('LiveTradingStrategyExecutor Gating & Paper Profiles', () => {
  let riskManager: RiskGateManager;
  let log: ReturnType<typeof vi.fn>;
  let executor: LiveTradingStrategyExecutor;
  let tickData: TickContext;

  beforeEach(() => {
    riskManager = makeRiskManager();
    log = vi.fn();
    executor = new LiveTradingStrategyExecutor(riskManager, log);
    tickData = makeTickData(riskManager);
  });

  it('blocks live execution when paper-to-live gating requirements fail', async () => {
    const tickFn = vi.fn();
    const result = await executor.executeStrategyTick(
      'strat-1',
      tickFn,
      tickData,
      { mode: 'LIVE' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Live execution blocked by Paper-to-Live Gating');
    expect(result.gatingResult?.eligible).toBe(false);
    expect(tickFn).not.toHaveBeenCalled();
  });

  it('allows live execution when strategy paper profile meets all gating requirements', async () => {
    const matureProfile: StrategyPaperProfile = {
      strategyKey: 'strat-mature',
      paperStartDate: Date.now() - 35 * 24 * 60 * 60 * 1000,
      totalPaperTrades: 60,
      winningTrades: 40,
      losingTrades: 20,
      grossProfitUsd: 2000,
      grossLossUsd: -1000,
      maxDrawdown: 0.08,
      sharpeRatio: 1.8,
      valWinRate: 0.65,
      testWinRate: 0.63,
      regimeKellyWired: true,
      circuitBreakerTested: true,
      exchangeConnected: true,
    };
    executor.registerPaperProfile(matureProfile);

    const tickFn = vi.fn().mockResolvedValue(undefined);
    const result = await executor.executeStrategyTick(
      'strat-mature',
      tickFn,
      tickData,
      { mode: 'LIVE' }
    );
    expect(result.success).toBe(true);
    expect(tickFn).toHaveBeenCalledOnce();
  });

  it('creates default profile with positive and negative pnl fallbacks', () => {
    executor.updatePaperPnl('pos', 150);
    executor.recordPaperTrade('pos');
    const evalPos = executor.evaluateGating('pos');
    expect(evalPos.eligible).toBe(false);

    executor.updatePaperPnl('neg', -50);
    executor.recordPaperTrade('neg');
    const evalNeg = executor.evaluateGating('neg');
    expect(evalNeg.eligible).toBe(false);
  });

  it('updates paper profile when trades and pnl are recorded', () => {
    const baseProfile: StrategyPaperProfile = {
      strategyKey: 'strat-tracked',
      paperStartDate: Date.now(),
      totalPaperTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfitUsd: 0,
      grossLossUsd: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
    };
    executor.registerPaperProfile(baseProfile);
    expect(executor.getPaperProfile('strat-tracked')).toBeDefined();

    executor.recordPaperTrade('strat-tracked');
    executor.updatePaperPnl('strat-tracked', 200);
    executor.updatePaperPnl('strat-tracked', -50);

    const updated = executor.getPaperProfile('strat-tracked');
    expect(updated?.totalPaperTrades).toBe(1);
    expect(updated?.winningTrades).toBe(1);
    expect(updated?.grossProfitUsd).toBe(200);
    expect(updated?.losingTrades).toBe(1);
    expect(updated?.grossLossUsd).toBe(50);
  });
});

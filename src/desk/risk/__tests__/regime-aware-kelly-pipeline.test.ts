import { describe, expect, it, vi } from 'vitest';
import { mockRedis } from './risk.fixtures';

vi.mock('../../../redis', () => ({ getRedisClient: () => mockRedis }));
vi.mock('../circuit-breaker-audit', () => ({
  logCircuitBreakerTripped: vi.fn().mockResolvedValue(undefined),
  logCircuitBreakerReset: vi.fn().mockResolvedValue(undefined),
}));

import { AlphaLabAutonomousPipeline } from '../../../alpha-lab/pipeline/alpha-lab-autonomous-pipeline';
import { CircuitBreaker } from '../circuit-breaker';
import { RegimeAwareKelly } from '../regime-aware-kelly';
import type { AISignal } from '../../strategies/ai-signal-adapter';

describe('Regime-Aware Kelly & Circuit Breaker Pipeline Integration', () => {
  it('wires default RegimeAwareKelly and CircuitBreaker instances into pipeline', () => {
    const pipeline = new AlphaLabAutonomousPipeline({
      symbol: 'ETH/USDT',
      timeframe: '1h',
      initialBalanceUsd: 50_000,
      liveCapitalUsdc: 50_000,
      strictLedgerVerification: false,
    });

    const kelly = pipeline.getRegimeKelly();
    const cb = pipeline.getCircuitBreaker();
    const router = pipeline.getPaperRouter();
    const liveCoord = pipeline.getLiveCoordinator();

    expect(kelly).toBeInstanceOf(RegimeAwareKelly);
    expect(cb).toBeInstanceOf(CircuitBreaker);
    expect(router).toBeDefined();
    expect(liveCoord).toBeDefined();
  });

  it('allows custom RegimeAwareKelly and CircuitBreaker injection', () => {
    const customKelly = new RegimeAwareKelly({
      kelly: {
        kellyFraction: 0.5,
        maxPositionFraction: 0.1,
        minPositionUsd: 5.0,
      },
      regimeMultipliers: {
        TREND_UP: 1.5,
        TREND_DOWN: 0.25,
        RANGE: 0.8,
        HIGH_VOLATILITY: 0.3,
        LOW_VOLATILITY: 1.2,
        SHOCK: 0.0,
        UNKNOWN: 0.5,
      },
    });

    const customCb = new CircuitBreaker(mockRedis as any, {
      maxLossStreak: 2,
      maxLatencyMs: 500,
    });

    const pipeline = new AlphaLabAutonomousPipeline({
      regimeKelly: customKelly,
      circuitBreaker: customCb,
      strictLedgerVerification: false,
    });

    expect(pipeline.getRegimeKelly()).toBe(customKelly);
    expect(pipeline.getCircuitBreaker()).toBe(customCb);
  });

  it('blocks paper trade dispatch when CircuitBreaker is tripped', async () => {
    const customCb = new CircuitBreaker(mockRedis as any, { maxLossStreak: 2 });
    const pipeline = new AlphaLabAutonomousPipeline({
      circuitBreaker: customCb,
      strictLedgerVerification: false,
    });

    await pipeline.start();

    // Trip circuit breaker manually
    await customCb.halt('Simulated market anomaly');

    const signal: AISignal = {
      signalId: 'sig-test-1',
      strategyId: 'strat-trend-alpha',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      action: 'BUY',
      confidence: 0.85,
      expectancy: 0.04,
      regime: 'TREND_UP',
      timestamp: Date.now(),
    };

    const outcomes = await pipeline.processSignals([signal], 65000);
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].status).toBe('REJECTED');
    expect(outcomes[0].reason).toContain('Risk circuit breaker active');
  });

  it('allocates zero size in SHOCK regime via RegimeAwareKelly', async () => {
    const pipeline = new AlphaLabAutonomousPipeline({
      strictLedgerVerification: false,
    });
    await pipeline.start();

    const shockSignal: AISignal = {
      signalId: 'sig-shock-1',
      strategyId: 'strat-shock',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      action: 'BUY',
      confidence: 0.9,
      expectancy: 0.05,
      regime: 'SHOCK',
      timestamp: Date.now(),
    };

    const outcomes = await pipeline.processSignals([shockSignal], 60000);
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].status).toBe('ZERO_SIZE');
    expect(outcomes[0].reason).toContain('Regime is SHOCK: zero allocation enforced');
  });
});

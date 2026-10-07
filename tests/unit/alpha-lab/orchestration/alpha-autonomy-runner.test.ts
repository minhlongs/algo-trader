/**
 * Alpha Lab Autonomy Runner & Scheduler Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlphaAutonomyRunner } from '../../../../src/alpha-lab/orchestration/alpha-autonomy-runner';
import { AlphaAutonomyScheduler } from '../../../../src/alpha-lab/orchestration/alpha-autonomy-scheduler';
import type { CandleLike } from '../../../../src/alpha-lab/regimes/regime-types';

function createMockCandles(count: number, trend: 'up' | 'down' | 'flat' = 'up'): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = 50000;
  const baseTime = Date.now() - count * 60_000;

  for (let i = 0; i < count; i++) {
    const step = trend === 'up' ? 100 : trend === 'down' ? -100 : (i % 2 === 0 ? 50 : -50);
    price += step;
    candles.push({
      timestamp: new Date(baseTime + i * 60_000).toISOString(),
      open: price - 20,
      high: price + 80,
      low: price - 80,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe('AlphaAutonomyRunner', () => {
  let runner: AlphaAutonomyRunner;

  beforeEach(() => {
    runner = new AlphaAutonomyRunner();
  });

  describe('calculateBoundedMetrics', () => {
    it('handles empty returns array safely without division by zero', () => {
      const metrics = runner.calculateBoundedMetrics([]);
      expect(metrics.profitFactor).toBe(1.0);
      expect(metrics.sharpeRatio).toBe(0.0);
      expect(metrics.maxDrawdownPct).toBe(0.0);
      expect(metrics.winRate).toBe(0.0);
      expect(metrics.tradeCount).toBe(0);
    });

    it('caps profit factor at 100.0 when there are zero losses', () => {
      const returns = [0.02, 0.03, 0.015, 0.04];
      const metrics = runner.calculateBoundedMetrics(returns);
      expect(metrics.profitFactor).toBe(100.0);
      expect(metrics.winRate).toBe(1.0);
    });

    it('bounds Sharpe ratio to maximum 50.0 and minimum -50.0', () => {
      // Extremely consistent high returns
      const ultraHighReturns = Array.from({ length: 100 }, () => 0.10);
      const metricsHigh = runner.calculateBoundedMetrics(ultraHighReturns);
      expect(metricsHigh.sharpeRatio).toBeLessThanOrEqual(50.0);
      expect(metricsHigh.sharpeRatio).toBeGreaterThanOrEqual(-50.0);
    });

    it('computes correct metrics for mixed win/loss series', () => {
      const mixed = [0.05, -0.02, 0.03, -0.01, 0.04];
      const metrics = runner.calculateBoundedMetrics(mixed);
      expect(metrics.tradeCount).toBe(5);
      expect(metrics.winRate).toBeCloseTo(0.6, 2);
      expect(metrics.profitFactor).toBeCloseTo((0.05 + 0.03 + 0.04) / (0.02 + 0.01), 2);
      expect(metrics.maxDrawdownPct).toBeGreaterThan(0);
      expect(metrics.maxDrawdownPct).toBeLessThan(1.0);
    });
  });

  describe('runTripleBarrierScan & runEvaluationCycle', () => {
    it('returns empty array when candle count is insufficient', () => {
      const fewCandles = createMockCandles(5);
      const returns = runner.runTripleBarrierScan(fewCandles, 0.02, 0.01, 6);
      expect(returns).toEqual([]);
    });

    it('evaluates candidate cycle and outputs metrics with baseline candles', async () => {
      const result = await runner.runEvaluationCycle({
        strategyId: 'momentum-alpha-v1',
        tpPct: 0.02,
        slPct: 0.01,
      });

      expect(result.strategyId).toBe('momentum-alpha-v1');
      expect(result.jobId).toContain('job-');
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
      expect(result.profitFactor).toBeLessThanOrEqual(100.0);
      expect(result.sharpeRatio).toBeLessThanOrEqual(50.0);
      expect(result.sharpeRatio).toBeGreaterThanOrEqual(-50.0);
      expect(typeof result.promoted).toBe('boolean');
    });

    it('promotes strategy when criteria are satisfied', async () => {
      const candles = createMockCandles(60, 'up');
      const result = await runner.runEvaluationCycle({
        strategyId: 'trend-winner',
        candles,
        tpPct: 0.01,
        slPct: 0.05,
        criteria: {
          minSharpe: 0.1,
          minProfitFactor: 1.0,
          minWinRate: 0.4,
          maxDrawdownPct: 0.5,
          minTradeCount: 1,
        },
      });

      expect(result.promoted).toBe(true);
    });
  });
});

describe('AlphaAutonomyScheduler', () => {
  let runner: AlphaAutonomyRunner;
  let scheduler: AlphaAutonomyScheduler;

  beforeEach(() => {
    runner = new AlphaAutonomyRunner();
    scheduler = new AlphaAutonomyScheduler(runner, {
      intervalMs: 10_000,
      runOnStart: false,
      maxConsecutiveFailures: 3,
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('starts and stops scheduler cleanly', () => {
    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('executes manual trigger cycle successfully', async () => {
    const job = await scheduler.triggerManualRun({ strategyId: 'manual-strat-1' });

    expect(job.status).toBe('COMPLETED');
    expect(job.metrics).toBeDefined();
    expect(job.metrics?.strategyId).toBe('manual-strat-1');
    expect(scheduler.getLastJob()?.jobId).toBe(job.jobId);
    expect(scheduler.getHistory()).toHaveLength(1);
  });

  it('enforces mutex lock against overlapping in-flight runs', async () => {
    let resolveRunner!: () => void;
    const slowPromise = new Promise<void>((res) => { resolveRunner = res; });

    vi.spyOn(runner, 'runEvaluationCycle').mockImplementation(async () => {
      await slowPromise;
      return {
        jobId: 'slow-job',
        strategyId: 'slow-strat',
        profitFactor: 2.0,
        sharpeRatio: 1.8,
        maxDrawdownPct: 0.1,
        winRate: 0.6,
        tradeCount: 20,
        labelsEvaluated: 20,
        promoted: true,
        executedAt: Date.now(),
      };
    });

    // Start first run
    const firstRunPromise = scheduler.triggerManualRun();
    expect(scheduler.isBusy()).toBe(true);

    // Second run should be SKIPPED due to mutex lock
    const secondJob = await scheduler.triggerManualRun();
    expect(secondJob.status).toBe('SKIPPED');
    expect(secondJob.error).toContain('mutex locked');

    resolveRunner();
    const firstJob = await firstRunPromise;
    expect(firstJob.status).toBe('COMPLETED');
    expect(scheduler.isBusy()).toBe(false);
  });

  it('trips circuit breaker and stops on repeated consecutive failures', async () => {
    vi.spyOn(runner, 'runEvaluationCycle').mockRejectedValue(new Error('Synthetic evaluation error'));

    // 1st failure
    const j1 = await scheduler.triggerManualRun();
    expect(j1.status).toBe('FAILED');

    // 2nd failure
    const j2 = await scheduler.triggerManualRun();
    expect(j2.status).toBe('FAILED');

    // Start running
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // 3rd failure (hits maxConsecutiveFailures: 3)
    const j3 = await scheduler.triggerManualRun();
    expect(j3.status).toBe('FAILED');
    expect(scheduler.isRunning()).toBe(false); // Tripped breaker stopped it
  });
});

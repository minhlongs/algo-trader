import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlphaAutonomyScheduler } from '../../../../src/alpha-lab/orchestration/alpha-autonomy-scheduler';
import { AlphaAutonomyRunner } from '../../../../src/alpha-lab/orchestration/alpha-autonomy-runner';

describe('AlphaAutonomyScheduler', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('initializes and triggers manual run successfully', async () => {
    const mockRunner = {
      runEvaluationCycle: vi.fn().mockResolvedValue({
        cycleId: 'c1',
        totalWalkforwardWindows: 5,
        meanSharpe: 1.8,
        meanProfitFactor: 2.1,
        meanWinRate: 0.58,
        isChallengerAccepted: true,
        candidateName: 'mean-reversion',
      }),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner, {
      intervalMs: 10000,
      runOnStart: false,
    });

    const job = await scheduler.triggerManualRun({ candidateName: 'momentum' });
    expect(job.status).toBe('COMPLETED');
    expect(job.metrics?.isChallengerAccepted).toBe(true);
    expect(scheduler.getLastJob()?.jobId).toBe(job.jobId);
  });

  it('skips job when previous cycle is still in flight (mutex enforcement)', async () => {
    let finishFirstCycle: () => void;
    const pendingPromise = new Promise<any>((resolve) => {
      finishFirstCycle = () =>
        resolve({
          cycleId: 'c2',
          totalWalkforwardWindows: 1,
          meanSharpe: 1.2,
          meanProfitFactor: 1.3,
          meanWinRate: 0.5,
          isChallengerAccepted: false,
          candidateName: 'test',
        });
    });

    const mockRunner = {
      runEvaluationCycle: vi.fn().mockReturnValue(pendingPromise),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner);
    const run1Promise = scheduler.triggerManualRun();
    expect(scheduler.isBusy()).toBe(true);

    const skippedJob = await scheduler.triggerManualRun();
    expect(skippedJob.status).toBe('SKIPPED');
    expect(skippedJob.error).toContain('mutex locked');

    finishFirstCycle!();
    await run1Promise;
    expect(scheduler.isBusy()).toBe(false);
  });

  it('tracks consecutive failures and trips circuit breaker', async () => {
    const mockRunner = {
      runEvaluationCycle: vi.fn().mockRejectedValue(new Error('Data pipeline offline')),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner, {
      intervalMs: 1000,
      maxConsecutiveFailures: 2,
    });

    scheduler.start();
    const job1 = await scheduler.triggerManualRun();
    expect(job1.status).toBe('FAILED');

    const job2 = await scheduler.triggerManualRun();
    expect(job2.status).toBe('FAILED');
    expect(scheduler.isRunning()).toBe(false);

    scheduler.stop();
  });

  it('caps history list at 50 records', async () => {
    const mockRunner = {
      runEvaluationCycle: vi.fn().mockResolvedValue({
        cycleId: 'c-bulk',
        totalWalkforwardWindows: 1,
        meanSharpe: 1.0,
        meanProfitFactor: 1.0,
        meanWinRate: 0.5,
        isChallengerAccepted: false,
        candidateName: 'bulk',
      }),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner);
    for (let i = 0; i < 55; i++) {
      await scheduler.triggerManualRun();
    }

    expect(scheduler.getHistory().length).toBe(50);
  });

  it('triggers immediate cycle when runOnStart is true and handles idempotent start/stop', async () => {
    const mockRunner = {
      runEvaluationCycle: vi.fn().mockResolvedValue({
        cycleId: 'c-start',
        totalWalkforwardWindows: 1,
        meanSharpe: 1.5,
        meanProfitFactor: 1.5,
        meanWinRate: 0.55,
        isChallengerAccepted: true,
        candidateName: 'start-run',
      }),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner, {
      intervalMs: 5000,
      runOnStart: true,
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Idempotent start
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    // Idempotent stop
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    expect(mockRunner.runEvaluationCycle).toHaveBeenCalledTimes(1);
  });

  it('handles non-Error rejection in runner gracefully', async () => {
    const mockRunner = {
      runEvaluationCycle: vi.fn().mockRejectedValue('Fatal string rejection'),
    } as unknown as AlphaAutonomyRunner;

    const scheduler = new AlphaAutonomyScheduler(mockRunner);
    const job = await scheduler.triggerManualRun();

    expect(job.status).toBe('FAILED');
    expect(job.error).toBe('Fatal string rejection');
  });
});

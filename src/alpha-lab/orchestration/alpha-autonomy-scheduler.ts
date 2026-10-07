/**
 * Alpha Lab Autonomy Scheduler
 *
 * Interval runner with mutex lock protection for single-flight autonomous
 * strategy pipeline evaluations. Background timers use unref() to prevent
 * process hang.
 */

import { logger } from '../../shared/utils/logger';
import type {
  SchedulerConfig,
  AutonomyJobRecord,
  AutonomyEvaluationOptions,
} from './alpha-autonomy-types';
import type { AlphaAutonomyRunner } from './alpha-autonomy-runner';

export class AlphaAutonomyScheduler {
  private readonly runner: AlphaAutonomyRunner;
  private readonly config: Required<SchedulerConfig>;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private consecutiveFailures = 0;
  private lastJob: AutonomyJobRecord | null = null;
  private readonly history: AutonomyJobRecord[] = [];

  constructor(runner: AlphaAutonomyRunner, config: SchedulerConfig = {}) {
    this.runner = runner;
    this.config = {
      intervalMs: config.intervalMs ?? 60_000,
      runOnStart: config.runOnStart ?? false,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 5,
    };
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }

  public isBusy(): boolean {
    return this.isProcessing;
  }

  public getLastJob(): AutonomyJobRecord | null {
    return this.lastJob;
  }

  public getHistory(): readonly AutonomyJobRecord[] {
    return this.history;
  }

  public start(): void {
    if (this.timer) return;
    if (this.config.runOnStart) {
      void this.executeCycle();
    }
    this.timer = setInterval(() => {
      void this.executeCycle();
    }, this.config.intervalMs);
    this.timer.unref();
    logger.info('Alpha autonomy scheduler started', { intervalMs: this.config.intervalMs });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Alpha autonomy scheduler stopped');
    }
  }

  public async triggerManualRun(options?: AutonomyEvaluationOptions): Promise<AutonomyJobRecord> {
    return this.executeCycle(options);
  }

  private async executeCycle(options?: AutonomyEvaluationOptions): Promise<AutonomyJobRecord> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Mutex lock check: single-flight enforcement
    if (this.isProcessing) {
      const skippedJob: AutonomyJobRecord = {
        jobId,
        status: 'SKIPPED',
        startTime: Date.now(),
        endTime: Date.now(),
        error: 'Prior evaluation cycle still in flight (mutex locked)',
      };
      this.recordJob(skippedJob);
      return skippedJob;
    }

    this.isProcessing = true;
    const record: AutonomyJobRecord = {
      jobId,
      status: 'RUNNING',
      startTime: Date.now(),
    };

    try {
      const metrics = await this.runner.runEvaluationCycle({ ...options });
      record.status = 'COMPLETED';
      record.metrics = metrics;
      record.endTime = Date.now();
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      record.status = 'FAILED';
      record.endTime = Date.now();
      record.error = err instanceof Error ? err.message : String(err);
      logger.warn('Alpha autonomy evaluation cycle failed', {
        jobId,
        consecutiveFailures: this.consecutiveFailures,
        error: record.error,
      });

      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        logger.error('Circuit breaker tripped: pausing alpha autonomy scheduler', {
          consecutiveFailures: this.consecutiveFailures,
        });
        this.stop();
      }
    } finally {
      this.isProcessing = false;
      this.recordJob(record);
    }

    return record;
  }

  private recordJob(job: AutonomyJobRecord): void {
    this.lastJob = job;
    this.history.push(job);
    if (this.history.length > 50) this.history.shift();
  }
}

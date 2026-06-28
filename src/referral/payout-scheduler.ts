/**
 * Payout Scheduler
 * BullMQ job for scheduled monthly commission payouts
 */

import { Queue, Job, Worker } from 'bullmq';
import { referralService } from './referral-service';
import { logger } from '../utils/logger';
import { getDbClient } from '../db/postgres-client';

interface PayoutJobData {
  tenantId?: string; // Optional: if provided, only payout for this tenant
  periodStart?: string;
  periodEnd?: string;
  manual: boolean;
}

export class PayoutScheduler {
  private queue: Queue<PayoutJobData>;

  constructor() {
    const connection = getDbClient() as any;

    this.queue = new Queue<PayoutJobData>('referral-payouts', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute
        },
        removeOnComplete: {
          count: 100,
          age: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
        removeOnFail: {
          count: 100,
          age: 7 * 24 * 60 * 60 * 1000,
        },
      },
    });

    this.startWorker();
  }

  /**
   * Schedule monthly payout job
   * Runs on the 1st of each month at 2 AM
   */
  async scheduleMonthlyPayout(): Promise<void> {
    const job = await this.queue.add('monthly-payout', {
      manual: false,
    }, {
      repeat: {
        pattern: '0 2 1 * *', // 2 AM on the 1st of every month
      },
    });

    logger.info('[PayoutScheduler] Monthly payout job scheduled', { jobId: job.id });
  }

  /**
   * Schedule a manual payout for a specific tenant
   */
  async scheduleManualPayout(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Job<PayoutJobData>> {
    const job = await this.queue.add('manual-payout', {
      tenantId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      manual: true,
    });

    logger.info('[PayoutScheduler] Manual payout scheduled', {
      jobId: job.id,
      tenantId,
      period: `${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
    });

    return job;
  }

  /**
   * Start the worker to process payout jobs
   */
  private startWorker(): void {
    const worker = new Worker<PayoutJobData>(
      'referral-payouts',
      async (job: Job<PayoutJobData>) => {
        logger.info('[PayoutScheduler] Processing payout job', {
          jobId: job.id,
          type: job.name,
          tenantId: job.data.tenantId,
        });

        try {
          const result = await referralService.runMonthlyPayout();

          logger.info('[PayoutScheduler] Payout job completed', {
            jobId: job.id,
            processed: result.processed,
            totalAmount: result.totalAmount,
            errorCount: result.errors.length,
          });

          if (result.errors.length > 0) {
            // Log errors but don't fail the job (partial success is acceptable)
            for (const error of result.errors) {
              logger.error('[PayoutScheduler] Payout error', {
                tenantId: error.tenantId,
                error: error.error,
              });
            }
          }

          return result;
        } catch (error) {
          logger.error('[PayoutScheduler] Payout job failed', {
            jobId: job.id,
            error,
          });
          throw error;
        }
      },
      { connection: getDbClient() as any }
    );

    worker.on('completed', (job: Job) => {
      logger.info('[PayoutScheduler] Job completed successfully', { jobId: job.id });
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('[PayoutScheduler] Job failed', {
        jobId: job?.id,
        error: error.message,
      });
    });

    worker.on('error', (error: Error) => {
      logger.error('[PayoutScheduler] Worker error', { error: error.message });
    });

    logger.info('[PayoutScheduler] Worker started for referral-payouts queue');
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waitingRes, activeRes, completedRes, failedRes, delayedRes] = await Promise.all([
      this.queue.getJobCounts('waiting'),
      this.queue.getJobCounts('active'),
      this.queue.getJobCounts('completed'),
      this.queue.getJobCounts('failed'),
      this.queue.getJobCounts('delayed'),
    ]);

    // Extract counts from response objects
    const waiting = waitingRes.waiting ?? 0;
    const active = activeRes.active ?? 0;
    const completed = completedRes.completed ?? 0;
    const failed = failedRes.failed ?? 0;
    const delayed = delayedRes.delayed ?? 0;

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Clean completed/failed jobs older than retention period
   */
  async cleanOldJobs(ageDays: number = 7): Promise<number> {
    const ageMs = ageDays * 24 * 60 * 60 * 1000;
    const limit = Number.MAX_SAFE_INTEGER; // effectively no limit
    const cleanedCompleted = await this.queue.clean(ageMs, limit, 'completed');
    const cleanedFailed = await this.queue.clean(ageMs, limit, 'failed');
    const totalCleaned = cleanedCompleted.length + cleanedFailed.length;
    logger.info('[PayoutScheduler] Old jobs cleaned', { ageDays, cleaned: totalCleaned });
    return totalCleaned;
  }

  /**
   * Close queue connection on shutdown
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}

let payoutSchedulerInstance: PayoutScheduler | null = null;

/**
 * Initialize payout scheduler
 */
export async function initializePayoutScheduler(): Promise<PayoutScheduler> {
  if (!payoutSchedulerInstance) {
    payoutSchedulerInstance = new PayoutScheduler();
    await payoutSchedulerInstance.scheduleMonthlyPayout();
  }
  return payoutSchedulerInstance;
}

/**
 * Get payout scheduler instance
 */
export function getPayoutScheduler(): PayoutScheduler | null {
  return payoutSchedulerInstance;
}

/**
 * Payout Worker Handler
 *
 * BullMQ worker creation and error handling for referral commission payout processing.
 */

import { Worker, type Job } from 'bullmq';
import { referralService } from './referral-service';
import { logger } from '../../shared/utils/logger';
import { getDbClient } from '../../shared/db/postgres-client.js';
import type { PayoutJobData } from './payout-scheduler-types';

export function createPayoutWorker(): Worker<PayoutJobData> {
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
  return worker;
}

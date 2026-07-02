/**
 * Marketplace Payout Scheduler
 * BullMQ cron job that processes pending marketplace_revenue_shares → paid.
 *
 * Flow: Find pending revenue shares → resolve creator wallet address →
 *       send USDT TRC20 via NOWPayments Payout API → mark as paid.
 *
 * If creator has no payoutAddress set, the record is marked paid with a
 * warning (manual intervention required).
 *
 * Runs weekly on Sunday at 2 AM. Also supports manual trigger for specific IDs.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { revenueShareRepository } from '../repositories/revenue-share-repository';
import { strategyRepository } from '../repositories';
import { NowPaymentsService } from '../../billing/nowpayments-service';
import { logger } from '../../../shared/utils/logger';

interface MarketplacePayoutJobData {
  revenueIds?: string[];  // specific revenue share IDs (manual trigger)
  periodStart?: string;
  manual: boolean;
}

export class MarketplacePayoutScheduler {
  private queue: Queue<MarketplacePayoutJobData>;

  constructor() {
    // BullMQ uses IORedis — same connection as referral scheduler
    const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 } as any;

    this.queue = new Queue<MarketplacePayoutJobData>('marketplace-payouts', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { count: 100, age: 7 * 24 * 60 * 60 * 1000 },
        removeOnFail: { count: 50, age: 7 * 24 * 60 * 60 * 1000 },
      },
    });

    this.startWorker();
  }

  /** Schedule weekly payout job (Sunday 2 AM) */
  async scheduleWeeklyPayout(): Promise<void> {
    await this.queue.add('weekly-payout', { manual: false }, {
      repeat: { pattern: '0 2 * * 0' },
    });
    logger.info('[MarketplacePayoutScheduler] Weekly payout job scheduled (Sun 2AM)');
  }

  /** Manually trigger payout for specific revenue share IDs */
  async triggerManualPayout(revenueIds: string[]): Promise<Job<MarketplacePayoutJobData>> {
    const job = await this.queue.add('manual-payout', {
      revenueIds, manual: true,
    });
    logger.info('[MarketplacePayoutScheduler] Manual payout triggered', { jobId: job.id, count: revenueIds.length });
    return job;
  }

  /** Start worker to process payout jobs */
  private startWorker(): void {
    new Worker<MarketplacePayoutJobData>(
      'marketplace-payouts',
      async (job: Job<MarketplacePayoutJobData>) => {
        logger.info('[MarketplacePayoutScheduler] Processing payout job', { jobId: job.id, manual: job.data.manual });

        let ids = job.data.revenueIds;

        // Auto mode: find all pending revenue shares
        if (!ids || ids.length === 0) {
          const result = await revenueShareRepository.findAll({ status: 'pending' }, { page: 1, limit: 500 });
          ids = result.data.map((r) => r.id);
        }

        if (ids.length === 0) {
          logger.info('[MarketplacePayoutScheduler] No pending revenue shares to process');
          return { processed: 0, ids: [] };
        }

        let paid = 0;
        const paidIds: string[] = [];
        const errors: { id: string; error: string }[] = [];
        const skippedIds: string[] = [];

        const nowpayments = NowPaymentsService.getInstance();

        for (const id of ids) {
          try {
            const record = await revenueShareRepository.findById(id);
            if (!record) {
              errors.push({ id, error: 'Not found' });
              continue;
            }
            if (record.status === 'paid') continue; // already paid

            // Resolve creator payout address from strategy
            const strategy = await strategyRepository.findById(record.strategyId);
            const payoutAddress = strategy?.payoutAddress?.trim();

            if (payoutAddress && record.creatorShareCents > 0) {
              const amountUsd = record.creatorShareCents / 100; // cents → USD
              const result = await nowpayments.createPayout({
                address: payoutAddress,
                amount: amountUsd,
              });

              if (result) {
                await revenueShareRepository.markAsPaid(id, result.payoutId);
                paid++;
                paidIds.push(id);
                logger.info('[MarketplacePayoutScheduler] USDT payout sent', {
                  revenueId: id,
                  payoutId: result.payoutId,
                  address: payoutAddress,
                  amountUsd,
                  creatorId: record.tenantId,
                });
              } else {
                errors.push({ id, error: `Payout API returned null for address ${payoutAddress}` });
                logger.error('[MarketplacePayoutScheduler] Payout API failed, revenue NOT marked paid', {
                  revenueId: id,
                  address: payoutAddress,
                  amountUsd,
                });
              }
            } else {
              if (!payoutAddress) {
                logger.warn('[MarketplacePayoutScheduler] No payoutAddress for creator, skipping', {
                  revenueId: id,
                  strategyId: record.strategyId,
                  creatorId: record.tenantId,
                });
              }
              skippedIds.push(id);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            errors.push({ id, error: message });
            logger.error('[MarketplacePayoutScheduler] Failed to process payout', { id, error: message });
          }
        }

        logger.info('[MarketplacePayoutScheduler] Payout job complete', {
          jobId: job.id, paid, errors: errors.length, skipped: skippedIds.length, total: ids.length,
        });

        return { processed: paid, errors, paidIds, skippedIds };
      },
      { connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 } as any }
    );

    logger.info('[MarketplacePayoutScheduler] Worker started for marketplace-payouts queue');
  }

  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getJobCounts('waiting'),
      this.queue.getJobCounts('active'),
      this.queue.getJobCounts('completed'),
      this.queue.getJobCounts('failed'),
      this.queue.getJobCounts('delayed'),
    ]);
    return {
      waiting: (waiting as any).waiting ?? 0,
      active: (active as any).active ?? 0,
      completed: (completed as any).completed ?? 0,
      failed: (failed as any).failed ?? 0,
      delayed: (delayed as any).delayed ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

let instance: MarketplacePayoutScheduler | null = null;

export async function initializeMarketplacePayoutScheduler(): Promise<MarketplacePayoutScheduler> {
  if (!instance) {
    instance = new MarketplacePayoutScheduler();
    await instance.scheduleWeeklyPayout();
  }
  return instance;
}

export function getMarketplacePayoutScheduler(): MarketplacePayoutScheduler | null {
  return instance;
}

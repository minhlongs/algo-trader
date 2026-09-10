/**
 * Referral Payout Job
 * Standalone monthly payout batch function extracted from ReferralService.
 * Finds pending commissions from the previous month and approves them.
 */

import { referralRepository } from './referral-repository';
import { commissionCalculator } from './commission-calculator';
import { logger } from '../../shared/utils/logger';

const MIN_PAYOUT_AMOUNT = 10; // Minimum $10 to process

/**
 * Approve a batch of commission records by marking each as 'approved'.
 */
async function approveCommissions(commissionIds: string[]): Promise<void> {
  for (const id of commissionIds) {
    await referralRepository.updateCommissionStatus(id, 'approved');
  }
}

/**
 * Run the monthly payout job.
 * Fetches all pending commissions from the previous month that meet the minimum
 * payout threshold, then approves them in sequence.
 *
 * In production, integrate Stripe Connect payouts inside the per-tenant loop
 * before calling approveCommissions.
 *
 * @returns Summary of processed payouts and any per-tenant errors.
 */
export async function runMonthlyPayout(): Promise<{
  processed: number;
  totalAmount: number;
  errors: Array<{ tenantId: string; error: string }>;
}> {
  logger.info('[Referral] Starting monthly payout job');

  const period = commissionCalculator.getPreviousMonthPeriod();

  try {
    const pending = await referralRepository.getPendingCommissions(
      period.start,
      period.end,
      MIN_PAYOUT_AMOUNT
    );

    logger.info('[Referral] Found pending payouts', {
      tenantCount: pending.length,
      period: `${period.start.toISOString().split('T')[0]} to ${period.end.toISOString().split('T')[0]}`,
    });

    let processed = 0;
    let totalAmount = 0;
    const errors: Array<{ tenantId: string; error: string }> = [];

    for (const payout of pending) {
      try {
        // In production, integrate with Stripe Connect here before approving
        await approveCommissions(payout.commissions);
        processed += payout.commissions.length;
        totalAmount += payout.amount;

        logger.info('[Referral] Payout approved', {
          tenantId: payout.tenantId,
          amount: payout.amount,
          commissionCount: payout.commissions.length,
        });
      } catch (err) {
        errors.push({
          tenantId: payout.tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
        logger.error('[Referral] Payout failed', { tenantId: payout.tenantId, error: err });
      }
    }

    return { processed, totalAmount, errors };
  } catch (error) {
    logger.error('[Referral] Monthly payout job failed', { error });
    throw error;
  }
}

import { referralRepository } from './referral-repository';
import { commissionCalculator } from './commission-calculator';
import { logger } from '../../shared/utils/logger';
import type { CommissionRecord } from './types';

export async function processReferralCommission(
  trackingId: string,
  revenueAmount: number
): Promise<CommissionRecord> {
  const tracking = await referralRepository.getTrackingById(trackingId);
  if (!tracking) throw new Error('Tracking record not found');
  if (!tracking.convertedTenantId) throw new Error('No conversion recorded for this tracking ID');

  const commissionAmount = commissionCalculator.calculateCommission(revenueAmount);
  const period = commissionCalculator.getPreviousMonthPeriod();

  const code = await referralRepository.getReferralCodeByCode(tracking.code);
  if (!code) throw new Error('Referral code not found');

  const commissionId = await referralRepository.createCommission(
    code.tenantId,
    trackingId,
    commissionAmount,
    commissionCalculator.calculateCommissionWithRate(1, 0.10),
    period.start,
    period.end,
    'pending'
  );

  await referralRepository.updateTrackingRevenue(trackingId, revenueAmount, commissionAmount);

  const commissionsResult = await referralRepository.getCommissions(code.tenantId);
  const commission = commissionsResult.commissions.find((c) => c.id === commissionId);
  if (!commission) throw new Error('Commission record not found after creation');

  logger.info('[Referral] Commission processed', {
    commissionId,
    trackingId,
    amount: commissionAmount,
    tenantId: code.tenantId,
  });

  return commission;
}

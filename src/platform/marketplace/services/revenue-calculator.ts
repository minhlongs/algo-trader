import type { IMarketplaceRevenueShare } from '../models/types';
import {
  PLATFORM_FEE_PERCENT,
  CREATOR_SHARE_PERCENT,
  PayoutCalculationResult,
  RevenueOverviewResult,
  RevenueReportResult,
} from './revenue.types';

export function calculatePayoutSplit(
  subscriptionId: string,
  amount: number
): PayoutCalculationResult {
  if (amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const platformShareCents = Math.round(amount * PLATFORM_FEE_PERCENT);
  const creatorShareCents = amount - platformShareCents;

  return {
    subscriptionId,
    grossRevenueCents: amount,
    platformShareCents,
    creatorShareCents,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    creatorSharePercent: CREATOR_SHARE_PERCENT,
  };
}

export function aggregateRevenueOverview(
  records: IMarketplaceRevenueShare[],
  filters?: { periodStart?: string; periodEnd?: string }
): RevenueOverviewResult {
  const total = records.reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.grossRevenueCents, 0);
  const payouts = records
    .filter((r: IMarketplaceRevenueShare) => r.status === 'paid')
    .reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.creatorShareCents, 0);
  const pending = records
    .filter((r: IMarketplaceRevenueShare) => r.status === 'pending')
    .reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.creatorShareCents, 0);

  return {
    totalRevenue: total,
    totalPayouts: payouts,
    pending,
    period: filters ? { start: filters.periodStart, end: filters.periodEnd } : undefined,
  };
}

export function aggregateRevenueReport(
  records: IMarketplaceRevenueShare[],
  tenantId: string,
  period: { start: Date; end: Date }
): RevenueReportResult {
  const totalGrossRevenueCents = records.reduce((s, r) => s + r.grossRevenueCents, 0);
  const totalPlatformShareCents = records.reduce((s, r) => s + r.platformShareCents, 0);
  const totalCreatorShareCents = records.reduce((s, r) => s + r.creatorShareCents, 0);

  const paidCents = records
    .filter((r) => r.status === 'paid')
    .reduce((s, r) => s + r.creatorShareCents, 0);
  const pendingCents = records
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + r.creatorShareCents, 0);
  const voidCents = records
    .filter((r) => r.status === 'void')
    .reduce((s, r) => s + r.creatorShareCents, 0);

  return {
    tenantId,
    period,
    totalGrossRevenueCents,
    totalPlatformShareCents,
    totalCreatorShareCents,
    paidCents,
    pendingCents,
    voidCents,
    transactionCount: records.length,
    records,
  };
}

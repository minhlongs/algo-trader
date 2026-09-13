import type { IMarketplaceRevenueShare } from '../models/types';

export const PLATFORM_FEE_PERCENT = 0.2; // 20%
export const CREATOR_SHARE_PERCENT = 0.8; // 80%

export interface RevenueOverviewResult {
  totalRevenue: number;
  totalPayouts: number;
  pending: number;
  period?: { start?: string; end?: string };
}

export interface PayoutCalculationResult {
  subscriptionId: string;
  grossRevenueCents: number;
  platformShareCents: number;
  creatorShareCents: number;
  platformFeePercent: number;
  creatorSharePercent: number;
}

export interface RevenueReportResult {
  tenantId: string;
  period: { start: Date; end: Date };
  totalGrossRevenueCents: number;
  totalPlatformShareCents: number;
  totalCreatorShareCents: number;
  paidCents: number;
  pendingCents: number;
  voidCents: number;
  transactionCount: number;
  records: IMarketplaceRevenueShare[];
}

export interface PayoutRequestMeta {
  subscriptionId?: string;
  strategyId?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

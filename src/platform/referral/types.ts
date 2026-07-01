/**
 * Referral Program Types
 * Defines TypeScript interfaces for referral tracking and commission management
 */

export interface ReferralCode {
  code: string;
  tenantId: string;
  createdAt: Date;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
}

export interface ReferralClick {
  id: string;
  code: string;
  clickedByIp: string;
  clickedByUserAgent: string;
  clickedAt: Date;
  convertedAt: Date | null;
  convertedTenantId: string | null;
  convertedUserId: string | null;
  revenueGenerated: number;
  commissionCalculated: number;
  fraudScore: number;
  isFraudulent: boolean;
  metadata: Record<string, unknown>;
}

export interface ReferralStats {
  totalClicks: number;
  uniqueClicks: number; // deduped by IP (24h window)
  conversions: number;
  conversionRate: number; // conversions / clicks
  totalRevenue: number; // from referred tenants
  totalCommissions: number; // earned
  pendingCommissions: number;
  paidCommissions: number;
  topReferrers: TopReferrer[];
  period: {
    start: string;
    end: string;
  };
}

export interface TopReferrer {
  tenantId: string;
  conversions: number;
  commissionEarned: number;
}

export interface CommissionRecord {
  id: string;
  tenantId: string;
  trackingId: string;
  commissionAmount: number;
  feePercentage: number;
  periodStart: Date;
  periodEnd: Date;
  status: CommissionStatus;
  paidAt: Date | null;
  stripePayoutId: string | null;
  createdAt: Date;
}

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'void';

export interface PayoutRecord {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  stripePayoutId: string | null;
  status: PayoutStatus;
  periodStart: string;
  periodEnd: string;
  paidAt: Date | null;
  commissionCount: number;
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ReferralClickMetadata {
  campaign?: string;
  landingPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
}

export interface FraudDetectionResult {
  score: number; // 0-100
  reasons: string[];
  isBlocked: boolean;
}

export interface FeeRecord {
  tenantId: string;
  period: Date;
  feeAmount: number;
  currency: string;
}

export interface PayoutResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: Array<{ tenantId: string; error: string }>;
}

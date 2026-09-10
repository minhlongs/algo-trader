/**
 * Subscription, Revenue Share, Dispute, and Dashboard Models
 * TypeScript interfaces and types for subscriptions, payments, revenue share, and disputes
 */

import type { CustomRiskLimits } from './strategy-types';

export interface IMarketplaceSubscription {
  id: string;
  tenantId: string;
  listingId: string;
  strategyId: string;
  status: SubscriptionStatus;
  allocationPercent: number; // 1-100
  customRiskLimits?: CustomRiskLimits;
  currentInvestmentUsd: number; // in cents
  totalPnlUsd: number; // in cents
  paymentId?: string;
  paymentStatus?: PaymentStatus;
  subscriptionStartedAt: Date;
  pausedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'suspended'
  | 'pending_payment';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'expired';

export interface IMarketplaceRevenueShare {
  id: string;
  strategyId: string;
  tenantId: string; // subscriber tenant
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  grossRevenueCents: number;
  platformShareCents: number; // 80%
  creatorShareCents: number; // 20%
  status: RevenueShareStatus;
  paidAt?: Date;
  stripePayoutId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RevenueShareStatus = 'pending' | 'paid' | 'void';

export interface IMarketplaceDispute {
  id: string;
  tenantId: string; // filer
  listingId: string;
  subscriptionId: string;
  reason: DisputeReason;
  description: string;
  evidenceUrls?: string[];
  status: DisputeStatus;
  resolution?: string;
  resolvedBy?: string; // admin userId
  resolvedAt?: Date;
  compensationAmountCents?: number;
  compensationType?: CompensationType;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DisputeReason =
  | 'performance_not_as_described'
  | 'unauthorized_charges'
  | 'poor_support'
  | 'strategy_broken'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_creator'
  | 'resolved_subscriber'
  | 'escalated'
  | 'closed';

export type CompensationType = 'full_refund' | 'partial_refund' | 'credit' | 'none';

export interface ICreatorDashboard {
  totalRevenueCents: number;
  totalPayoutsCents: number;
  pendingPayoutsCents: number;
  activeSubscriberCount: number;
  avgRevenuePerSubscriberCents: number;
  recentPayouts: IPayoutDetail[];
  monthlyTrend: IMonthlyTrend[];
  topStrategies: ITopStrategy[];
}

export interface IPayoutDetail {
  id: string;
  amountCents: number;
  status: RevenueShareStatus;
  paidAt?: Date;
  stripePayoutId?: string;
}

export interface IMonthlyTrend {
  month: string; // '2025-06'
  revenueCents: number;
  payoutsCents: number;
  newSubscribers: number;
}

export interface ITopStrategy {
  strategyId: string;
  name: string;
  subscriberCount: number;
  revenueCents: number;
  avgRating: number;
}

export interface IStripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

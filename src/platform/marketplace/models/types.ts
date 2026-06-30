/**
 * Marketplace Models
 * TypeScript interfaces and types for marketplace domain
 */

// ==================== Strategy ====================

export interface IMarketplaceStrategy {
  id: string;
  tenantId: string;
  creatorId: string;
  name: string;
  description: string;
  category: StrategyCategory;
  status: StrategyStatus;
  riskLevel: number; // 1-10
  minAllocationUsd: number; // in cents
  maxAllocationUsd: number; // in cents
  supportedExchanges: string[]; // e.g., ['polymarket', 'binance']
  tags: string[];
  backtestSummary?: BacktestSummary;
  vettedAt?: Date;
  vettedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type StrategyCategory =
  | 'arbitrage'
  | 'momentum'
  | 'mean-reversion'
  | 'statistical'
  | 'portfolio'
  | 'risk'
  | 'hedging'
  | 'other';

export type StrategyStatus =
  | 'draft'
  | 'pending_vetting'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface BacktestSummary {
  sharpe: number;
  maxDrawdown: number; // percentage
  winRate: number; // percentage
  periodDays: number;
  totalTrades?: number;
  totalPnlUsd?: number;
  profitFactor?: number;
}

// ==================== Listing ====================

export interface IMarketplaceListing {
  id: string;
  strategyId: string;
  tenantId: string; // redundant for query performance
  priceUsdMonthly: number; // in cents
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  riskLimits: RiskLimits;
  allowedTenants: string[]; // empty = all allowed
  excludedTenants: string[]; // blacklist
  isActive: boolean;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskLimits {
  maxDailyLossPercent: number;
  maxPositionSizePercent: number;
  stopLossPercent: number;
  maxConcurrentTrades: number;
}

export interface CustomRiskLimits {
  maxDailyLossPercent?: number;
  maxPositionSizePercent?: number;
  stopLossPercent?: number;
  maxConcurrentTrades?: number;
}

// ==================== Subscription ====================

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

// ==================== Performance ====================

export interface IMarketplacePerformance {
  id?: number; // auto-increment
  strategyId: string;
  tenantId?: string | null; // null = aggregate (published strategy)
  date: Date; // performance date (usually daily)
  sharpeRatio?: number;
  maxDrawdown?: number;
  totalPnlUsd: number; // in cents
  winRate?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinUsd?: number;
  avgLossUsd?: number;
  profitFactor?: number;
  volatility?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Review ====================

export interface IMarketplaceReview {
  id: string;
  tenantId: string;
  strategyId: string;
  subscriptionId: string;
  rating: number; // 1-5
  comment: string;
  isVerified: boolean; // true if subscription active at review time
  helpfulVotes: number;
  reportedCount: number;
  isFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Revenue Share ====================

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

// ==================== Dispute ====================

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

// ==================== Ranking ====================

export interface IStrategyRanking {
  strategyId: string;
  name: string;
  category: string;
  riskLevel: number;
  creatorName: string;
  priceUsdMonthly: number;
  subscriberCount: number;
  avgRating: number;
  reviewCount: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalPnlUsd: number;
  rank: number;
}

export type RankingMetric = 'sharpe' | 'total_pnl' | 'win_rate' | 'subscriber_count';
export type RankingTimeframe = '7d' | '30d' | '90d' | 'all';

// ==================== Dashboard ====================

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

// ==================== Webhook ====================

export interface IStripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: any;
  };
}

// ==================== Utility Types ====================

export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SortOrder = 'asc' | 'desc';

export type SortField =
  | 'sharpe'
  | 'max_drawdown'
  | 'win_rate'
  | 'total_pnl'
  | 'subscriber_count'
  | 'created_at';

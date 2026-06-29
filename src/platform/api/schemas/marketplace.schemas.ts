/**
 * Marketplace API Validation Schemas
 * All Zod schemas for marketplace endpoint validation
 */

import { z } from 'zod';

// ==================== Strategy Schemas ====================

export const publishStrategySchema = z.object({
  name: z.string().min(3).max(255).describe('Strategy name'),
  description: z.string().min(50).max(2000).describe('Detailed strategy description'),
  category: z.enum([
    'arbitrage',
    'momentum',
    'mean-reversion',
    'statistical',
    'portfolio',
    'risk',
    'hedging',
    'other'
  ]).describe('Strategy category'),
  riskLevel: z.number().int().min(1).max(10).describe('Risk level 1-10'),
  minAllocationUsd: z.number().int().min(100).max(100000).describe('Minimum investment in cents'),
  maxAllocationUsd: z.number().int().min(100).max(10000000).describe('Maximum investment in cents'),
  supportedExchanges: z.array(z.string()).optional().describe('List of supported exchanges'),
  tags: z.array(z.string()).max(10).optional().describe('Strategy tags for search'),
  backtestSummary: z.object({
    sharpe: z.number().describe('Sharpe ratio from backtest'),
    maxDrawdown: z.number().describe('Max drawdown percentage'),
    winRate: z.number().min(0).max(100).describe('Win rate percentage'),
    periodDays: z.number().int().min(30).describe('Backtest period in days'),
    totalTrades: z.number().int().optional().describe('Total trades in backtest'),
  }).optional().describe('Backtest performance summary'),
});

export const strategyFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().int().min(1).max(10).optional(),
  minSharpe: z.number().optional(),
  maxDrawdown: z.number().optional(),
  status: z.enum(['approved', 'suspended']).optional(),
  sortBy: z.enum([
    'sharpe',
    'max_drawdown',
    'win_rate',
    'total_pnl',
    'subscriber_count',
    'created_at'
  ]).default('sharpe'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(100).optional().describe('Full-text search in name/description'),
});

export const vettingDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'request_changes']),
  rejectionReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

// ==================== Subscription Schemas ====================

export const subscribeSchema = z.object({
  listingId: z.string().min(1).describe('Listing ID to subscribe to'),
  allocationPercent: z.number().min(1).max(100).describe('Allocation percentage of portfolio'),
  customRiskLimits: z.object({
    maxDailyLossPercent: z.number().min(0.1).max(50).optional(),
    maxPositionSizePercent: z.number().min(0.1).max(100).optional(),
    stopLossPercent: z.number().min(0.1).max(50).optional(),
    maxConcurrentTrades: z.number().int().min(1).max(50).optional(),
  }).optional().describe('Custom risk overrides'),
});

export const updateSubscriptionSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  allocationPercent: z.number().min(1).max(100).optional(),
  customRiskLimits: z.object({
    maxDailyLossPercent: z.number().optional(),
    maxPositionSizePercent: z.number().optional(),
    stopLossPercent: z.number().optional(),
    maxConcurrentTrades: z.number().int().optional(),
  }).optional(),
});

// ==================== Review Schemas ====================

export const reviewSchema = z.object({
  strategyId: z.string().min(1),
  rating: z.number().int().min(1).max(5).describe('Rating 1-5'),
  comment: z.string().min(10).max(1000).describe('Review comment'),
});

export const helpfulVoteSchema = z.object({
  helpful: z.boolean().describe('Mark review as helpful'),
});

// ==================== Performance Schemas ====================

export const performanceQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  tenantSpecific: z.boolean().default(false).describe('Get subscriber-specific performance'),
});

export const rankingFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().int().min(1).max(10).optional(),
  minSubscribers: z.number().int().min(0).optional(),
  timeframe: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  metric: z.enum(['sharpe', 'total_pnl', 'win_rate']).default('sharpe'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ==================== Dispute Schemas ====================

export const disputeSchema = z.object({
  listingId: z.string().min(1),
  subscriptionId: z.string().min(1),
  reason: z.enum([
    'performance_not_as_described',
    'unauthorized_charges',
    'poor_support',
    'strategy_broken',
    'other'
  ]),
  description: z.string().min(50).max(2000),
  evidenceUrls: z.array(z.string().url()).optional().describe('URLs to supporting evidence'),
});

export const disputeResolutionSchema = z.object({
  resolution: z.enum(['resolved_creator', 'resolved_subscriber', 'escalated']),
  compensationAmountCents: z.number().int().min(0).optional(),
  compensationType: z.enum(['full_refund', 'partial_refund', 'credit', 'none']).optional(),
  adminNotes: z.string().max(2000).optional(),
});

// ==================== Revenue Schemas ====================

export const revenueFilterSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  status: z.enum(['pending', 'paid', 'void']).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ==================== Payout Schemas (Stripe) ====================

export const payoutRequestSchema = z.object({
  amountUsd: z.number().min(10).max(10000).describe('Payout amount in USD'),
  bankAccountId: z.string().optional().describe('Stripe bank account ID'),
});

// ==================== Admin Schemas ====================

export const adminStrategyQuerySchema = z.object({
  status: z.enum(['draft', 'pending_vetting', 'approved', 'rejected', 'suspended']).optional(),
  creatorId: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const featuredStrategySchema = z.object({
  isFeatured: z.boolean().describe('Mark as featured on homepage'),
  featuredOrder: z.number().int().min(0).optional().describe('Display order (lower first)'),
});

// ==================== Webhook Schemas ====================

export const stripeWebhookSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  data: z.object({
    object: z.any().describe('Stripe event data'),
  }),
});

// ==================== Response Schemas ====================

export const paginatedResponseSchema = z.object({
  data: z.array(z.any()),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const strategyDetailResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  riskLevel: z.number(),
  creator: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  listing: z.object({
    priceUsdMonthly: z.number(),
    billingCycle: z.string(),
    isActive: z.boolean(),
    subscriberCount: z.number(),
  }).nullable(),
  performance: z.object({
    sharpeRatio: z.number().nullable(),
    maxDrawdown: z.number().nullable(),
    winRate: z.number().nullable(),
    totalPnlUsd: z.number(),
    totalSubscribers: z.number(),
    avgRating: z.number().nullable(),
    reviewCount: z.number(),
  }),
  reviews: z.array(z.object({
    id: z.string(),
    rating: z.number(),
    comment: z.string(),
    createdAt: z.string().datetime(),
    tenant: z.object({
      name: z.string(),
    }),
    helpfulVotes: z.number(),
  })),
});

export const revenueDashboardSchema = z.object({
  totalRevenueCents: z.number(),
  totalPayoutsCents: z.number(),
  pendingPayoutsCents: z.number(),
  subscriberCount: z.number(),
  avgRevenuePerSubscriberCents: z.number(),
  recentPayouts: z.array(z.object({
    id: z.string(),
    amountCents: z.number(),
    status: z.string(),
    paidAt: z.string().datetime().nullable(),
    stripePayoutId: z.string().nullable(),
  })),
  monthlyTrend: z.array(z.object({
    month: z.string(),
    revenueCents: z.number(),
    payoutsCents: z.number(),
    newSubscribers: z.number(),
  })),
});

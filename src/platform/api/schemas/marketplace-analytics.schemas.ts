/**
 * Marketplace Analytics Schemas
 * Zod schemas for performance queries, rankings, revenue, payouts,
 * admin queries, featured strategies, webhooks, and response shapes.
 */

import { z } from 'zod';

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

export const revenueFilterSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  status: z.enum(['pending', 'paid', 'void']).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const payoutRequestSchema = z.object({
  amountUsd: z.number().min(10).max(10000).describe('Payout amount in USD'),
  bankAccountId: z.string().optional().describe('Stripe bank account ID'),
});

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

export const stripeWebhookSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  data: z.object({
    object: z.any().describe('Stripe event data'),
  }),
});

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
    tenant: z.object({ name: z.string() }),
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

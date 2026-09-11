/**
 * Marketplace Engagement Schemas
 * Zod schemas for subscriptions, reviews, helpful votes, and disputes.
 */

import { z } from 'zod';

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

export const reviewSchema = z.object({
  strategyId: z.string().min(1),
  rating: z.number().int().min(1).max(5).describe('Rating 1-5'),
  comment: z.string().min(10).max(1000).describe('Review comment'),
});

export const helpfulVoteSchema = z.object({
  helpful: z.boolean().describe('Mark review as helpful'),
});

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

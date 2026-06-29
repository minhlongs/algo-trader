/**
 * Marketplace Review Routes
 *
 * Endpoints:
 * - POST / - Create review (verified subscribers only)
 * - GET /strategies/:id - List reviews for a strategy
 * - POST /:id/helpful - Mark review as helpful
 * - POST /:id/report - Flag review for moderation
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { AuditLogService, type AuditEventType } from '../../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';

export const marketplaceReviewRouter: RouterType = Router();

const subscriptionService = SubscriptionService.getInstance();
const marketplaceService = MarketplaceService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

const createReviewSchema = z.object({
  strategyId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(2000),
});

const reviewFilterSchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ==================== Helper Functions ====================

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

function getUserId(req: Request): string {
  const userId = (req as any).user?.id || (req as any).apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return String(userId);
}

function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

function getQueryNumber(value: unknown, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return parseInt(first, 10) || defaultValue;
    if (typeof first === 'number') return first;
    return defaultValue;
  }
  if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
  if (typeof value === 'number') return value;
  return defaultValue;
}

function isAdmin(req: Request): boolean {
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
}

// ==================== Routes ====================

/**
 * POST /api/v1/marketplace/reviews
 * Create a review - only verified subscribers can review
 */
marketplaceReviewRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const { strategyId, rating, comment } = parsed.data;

    // Verify strategy exists and is approved
    const strategy = await marketplaceService.getStrategy(strategyId);
    if (!strategy) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${strategyId} not found`,
      });
    }

    if (strategy.status !== 'approved') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot review a strategy that is not approved',
      });
    }

    // Verify tenant has an active subscription to this strategy
    const hasSubscription = await subscriptionService.hasActiveSubscription(
      tenantId,
      strategyId
    );
    if (!hasSubscription) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only verified subscribers can write reviews',
      });
    }

    const review = await subscriptionService.createReview({
      strategyId,
      tenantId,
      userId,
      rating,
      comment,
    });

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'review_created',
          userId,
          resourceId: review.id,
          strategyId,
          rating,
        },
      }
    );

    logger.info('[Marketplace] Review created', {
      reviewId: review.id,
      strategyId,
      tenantId,
      rating,
    });

    return res.status(201).json(review);
  } catch (error) {
    logger.error('[Marketplace] Error creating review', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create review',
    });
  }
});

/**
 * GET /api/v1/marketplace/reviews/strategies/:id
 * List reviews for a strategy
 */
marketplaceReviewRouter.get('/strategies/:id', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);

    const parsed = reviewFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const filters = parsed.data;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    const allReviews = details.reviews || [];
    const reviews = allReviews.slice(offset, offset + limit);

    return res.json({
      data: reviews,
      total: allReviews.length,
      page,
      limit,
      totalPages: Math.ceil(allReviews.length / limit),
    });
  } catch (error) {
    logger.error('[Marketplace] Error listing reviews', {
      error,
      strategyId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list reviews',
    });
  }
});

/**
 * POST /api/v1/marketplace/reviews/:id/helpful
 * Mark review as helpful
 */
marketplaceReviewRouter.post('/:id/helpful', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const review = await subscriptionService.getReview(id);
    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: `Review ${id} not found`,
      });
    }

    if (review.isFlagged) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot vote on a flagged review',
      });
    }

    const updated = await subscriptionService.markReviewHelpful(id);

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'review_marked_helpful',
          userId,
          resourceId: id,
          strategyId: review.strategyId,
        },
      }
    );

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error marking review helpful', {
      error,
      reviewId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark review as helpful',
    });
  }
});

/**
 * POST /api/v1/marketplace/reviews/:id/report
 * Flag review for moderation
 */
marketplaceReviewRouter.post('/:id/report', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const review = await subscriptionService.getReview(id);
    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: `Review ${id} not found`,
      });
    }

    const updated = await subscriptionService.flagReview(id);

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'review_reported',
          userId,
          resourceId: id,
          strategyId: review.strategyId,
        },
      }
    );

    logger.info('[Marketplace] Review flagged for moderation', {
      reviewId: id,
      strategyId: review.strategyId,
      tenantId,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error reporting review', {
      error,
      reviewId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to report review',
    });
  }
});

export default marketplaceReviewRouter;

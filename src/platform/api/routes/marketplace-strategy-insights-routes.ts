/**
 * Marketplace Strategy Insights Routes
 * Performance metrics and reviews for strategies
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  getQueryString,
  getQueryNumber,
} from './marketplace-strategy-helpers';

export const marketplaceStrategyInsightsRouter: RouterType = Router();

const marketplaceService = MarketplaceService.getInstance();

/**
 * GET /:id/performance — Get performance metrics for a strategy
 */
marketplaceStrategyInsightsRouter.get('/:id/performance', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const details = await marketplaceService.getStrategyWithDetails(id);

    if (!details || !details.performance) {
      return res.status(404).json({
        error: 'Not found', message: `Performance data not found for strategy ${id}`,
      });
    }

    return res.json(details.performance);
  } catch (error) {
    logger.error('[Marketplace] Error getting performance', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get performance data' });
  }
});

/**
 * GET /:id/reviews — Get reviews for a strategy
 */
marketplaceStrategyInsightsRouter.get('/:id/reviews', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const page = getQueryNumber(req.query.page, 1);
    const limit = getQueryNumber(req.query.limit, 20);

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    const allReviews = details.reviews || [];
    const start = (page - 1) * limit;
    const reviews = allReviews.slice(start, start + limit);

    return res.json({
      data: reviews,
      total: allReviews.length,
      page,
      limit,
      totalPages: Math.ceil(allReviews.length / limit),
    });
  } catch (error) {
    logger.error('[Marketplace] Error getting reviews', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get reviews' });
  }
});

/**
 * Marketplace Strategy Insights Routes
 * Performance metrics and reviews for strategies
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getQueryNumber } from './marketplace-strategy-helpers';
import { getDbClient } from '../../../db/postgres-client';
import { BacktestRunner, type BacktestConfig } from '../../../shared/backtesting/backtest-runner';
import { randomUUID } from 'crypto';
import {
  paginateStrategyReviews,
  validateBacktestTrades,
  buildBacktestInsertValues,
  mapMarketplaceBacktestRow,
} from './marketplace-strategy-insights-helpers';

export {
  paginateStrategyReviews,
  validateBacktestTrades,
  buildBacktestInsertValues,
  mapMarketplaceBacktestRow,
};

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

    return res.json(paginateStrategyReviews(details.reviews || [], page, limit));
  } catch (error) {
    logger.error('[Marketplace] Error getting reviews', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get reviews' });
  }
});

/**
 * POST /:id/backtest - Run backtest for a strategy
 */
marketplaceStrategyInsightsRouter.post('/:id/backtest', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details || !details.strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    const { trades, config } = req.body as {
      trades?: unknown;
      config?: Record<string, unknown>;
    };

    const validation = validateBacktestTrades(trades);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation error', message: validation.message });
    }

    const result = BacktestRunner.run(validation.trades, config as unknown as BacktestConfig);
    const dbClient = getDbClient();
    const backtestId = randomUUID();

    await dbClient.query(
      `INSERT INTO marketplace_backtests (id, strategy_id, tenant_id, sharpe_ratio, max_drawdown, win_rate, total_pnl_usd, profit_factor, total_trades, winning_trades, losing_trades, volatility, total_return, initial_capital_usd, config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      buildBacktestInsertValues(backtestId, id, details.strategy.tenantId, result, config)
    );

    return res.status(201).json({ id: backtestId, ...result });
  } catch (error) {
    logger.error('[Marketplace] Error running backtest', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to run backtest' });
  }
});

/**
 * GET /:id/backtests - List backtests for a strategy
 */
marketplaceStrategyInsightsRouter.get('/:id/backtests', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details || !details.strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    const limit = getQueryNumber(req.query.limit, 20);
    const dbClient = getDbClient();
    const result = await dbClient.query(
      'SELECT * FROM marketplace_backtests WHERE strategy_id = $1 ORDER BY created_at DESC LIMIT $2',
      [id, Math.min(limit, 100)]
    );

    const backtests = (result.rows as Record<string, unknown>[]).map(mapMarketplaceBacktestRow);
    return res.json({ data: backtests, total: backtests.length });
  } catch (error) {
    logger.error('[Marketplace] Error listing backtests', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list backtests' });
  }
});

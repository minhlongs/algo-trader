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
import { getDbClient } from '../../../db/postgres-client';
import { BacktestRunner } from '../../../shared/backtesting/backtest-runner';
import { randomUUID } from 'crypto';

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


/**
 * POST /:id/backtest - Run backtest for a strategy
 */
marketplaceStrategyInsightsRouter.post('/:id/backtest', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Validate strategy exists
    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details || !details.strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    // Validate request body
    const { trades, config } = req.body as {
      trades?: Array<{ entryTimestamp: number; exitTimestamp: number; pnlUsd: number; entryPrice: number; exitPrice: number; size: number; side: string }>;
      config?: Record<string, unknown>;
    };

    if (!trades || !Array.isArray(trades) || trades.length === 0) {
      return res.status(400).json({ error: 'Validation error', message: 'trades array is required and must not be empty' });
    }

    // Validate required numeric fields
    for (const t of trades) {
      if (typeof t.entryTimestamp !== 'number' || typeof t.exitTimestamp !== 'number' ||
          typeof t.pnlUsd !== 'number' || typeof t.entryPrice !== 'number' ||
          typeof t.exitPrice !== 'number' || typeof t.size !== 'number') {
        return res.status(400).json({ error: 'Validation error', message: 'Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice, size as numbers' });
      }
    }

    // Run backtest
    const result = BacktestRunner.run(trades as any[], config as any);

    // Persist to database
    const dbClient = getDbClient();
    const backtestId = randomUUID();
    await dbClient.query(
      `INSERT INTO marketplace_backtests (id, strategy_id, tenant_id, sharpe_ratio, max_drawdown, win_rate, total_pnl_usd, profit_factor, total_trades, winning_trades, losing_trades, volatility, total_return, initial_capital_usd, config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      [
        backtestId,
        id,
        details.strategy.tenantId,
        result.sharpeRatio ?? null,
        result.maxDrawdown ?? null,
        result.winRate ?? null,
        result.totalPnlUsd,
        (result as any).profitFactor ?? null,
        result.totalTrades,
        result.winningTrades,
        result.losingTrades,
        (result as any).volatilityAnnual ?? null,
        result.totalReturn ?? null,
        (config as any)?.initialCapitalUsd ?? 10000,
        JSON.stringify(config ?? {}),
      ]
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

    // Map snake_case to camelCase
    const backtests = (result.rows as any[]).map((row) => ({
      id: row.id,
      sharpeRatio: row.sharpe_ratio,
      maxDrawdown: row.max_drawdown,
      winRate: row.win_rate,
      totalPnlUsd: row.total_pnl_usd,
      profitFactor: row.profit_factor,
      totalTrades: row.total_trades,
      winningTrades: row.winning_trades,
      losingTrades: row.losing_trades,
      volatility: row.volatility,
      totalReturn: row.total_return,
      createdAt: row.created_at,
    }));

    return res.json({ data: backtests, total: backtests.length });
  } catch (error) {
    logger.error('[Marketplace] Error listing backtests', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list backtests' });
  }
});

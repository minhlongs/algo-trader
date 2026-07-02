/**
 * Marketplace Strategy Insights Routes
 * Performance metrics and reviews for strategies
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { randomUUID } from 'crypto';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { BacktestRunner } from '../../../shared/backtesting/backtest-runner';
import type { BacktestTrade } from '../../../shared/backtesting/backtest-runner';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/**
 * POST /:id/backtest — Run backtest on a strategy (PRO tier)
 */
marketplaceStrategyInsightsRouter.post('/:id/backtest', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    const { trades, config } = req.body;

    // Validate trades array
    if (!Array.isArray(trades)) {
      return res.status(400).json({ error: 'Validation error', message: 'trades array is required' });
    }
    if (trades.length === 0) {
      return res.status(400).json({ error: 'Validation error', message: 'trades array must not be empty' });
    }

    for (const trade of trades) {
      if (typeof trade.entryTimestamp !== 'number' || typeof trade.exitTimestamp !== 'number' ||
          typeof trade.pnlUsd !== 'number' || typeof trade.entryPrice !== 'number' ||
          typeof trade.exitPrice !== 'number' || typeof trade.size !== 'number' ||
          typeof trade.side !== 'string') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice, size, and side',
        });
      }
    }

    const result = BacktestRunner.run(trades as BacktestTrade[], config);
    const backtestId = randomUUID();

    // Persist to marketplace_backtests table
    const client = getDbClient();
    await client.query(
      `INSERT INTO marketplace_backtests (
        id, strategy_id, tenant_id, sharpe_ratio, max_drawdown, win_rate,
        total_pnl_usd, profit_factor, total_trades, winning_trades, losing_trades,
        avg_win_usd, avg_loss_usd, volatility, equity_curve, total_return,
        initial_capital_usd, config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        backtestId, id, req.tenant?.id ?? 'unknown',
        result.sharpeRatio, result.maxDrawdown, result.winRate,
        Math.round(result.totalPnlUsd * 100), result.profitFactor,
        result.totalTrades, result.winningTrades, result.losingTrades,
        Math.round(result.avgWinUsd * 100), Math.round(result.avgLossUsd * 100),
        result.volatilityAnnual, JSON.stringify(result.equityCurve),
        result.totalReturn, config?.initialCapitalUsd ?? 10000,
        config ? JSON.stringify(config) : null,
      ],
    );

    logger.info('[Marketplace] Backtest saved', { strategyId: id, backtestId, trades: result.totalTrades });
    return res.status(201).json({ id: backtestId, ...result });
  } catch (error) {
    logger.error('[Marketplace] Error running backtest', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to run backtest' });
  }
});

/**
 * GET /:id/backtests — List backtest history for a strategy
 */
marketplaceStrategyInsightsRouter.get('/:id/backtests', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const limit = getQueryNumber(req.query.limit, 20);

    const client = getDbClient();
    const dbResult = await client.query(
      `SELECT id, sharpe_ratio, max_drawdown, win_rate, total_pnl_usd, profit_factor,
              total_trades, winning_trades, losing_trades, volatility, total_return, created_at
       FROM marketplace_backtests
       WHERE strategy_id = $1 AND tenant_id = $3
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit, req.tenant?.id ?? 'unknown'],
    );

    const backtests = dbResult.rows.map((row: Record<string, unknown>) => ({
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

    return res.json({ data: backtests });
  } catch (error) {
    logger.error('[Marketplace] Error listing backtests', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list backtests' });
  }
});

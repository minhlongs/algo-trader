/**
 * Community Strategy Backtest Route
 * POST /:id/backtest handler — runs backtest on an uploaded strategy.
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { BacktestRunner, BacktestTrade } from '../../../shared/backtesting/backtest-runner';
import type { BacktestRequestBody } from './community-strategy-types';

export function registerBacktestRoute(router: RouterType): void {
  /** POST /:id/backtest — Run backtest on uploaded strategy */
  router.post('/:id/backtest', requireTier('PRO'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { trades, config } = req.body as BacktestRequestBody;

      if (!trades || !Array.isArray(trades) || trades.length === 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'trades array is required and must be non-empty',
        });
      }

      // Validate trade shape
      for (const t of trades as BacktestTrade[]) {
        if (
          typeof t.entryTimestamp !== 'number' ||
          typeof t.exitTimestamp !== 'number' ||
          typeof t.pnlUsd !== 'number' ||
          typeof t.entryPrice !== 'number' ||
          typeof t.exitPrice !== 'number'
        ) {
          return res.status(400).json({
            error: 'Validation error',
            message: 'Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice',
          });
        }
      }

      // Verify strategy exists
      const db = getDbClient();
      const existing = await db.query('SELECT id FROM community_strategies WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
      }

      // Run backtest
      const result = BacktestRunner.run(trades as BacktestTrade[], config);

      // Persist backtest result
      await db.query(
        `UPDATE community_strategies
         SET backtest_result = $2, sandbox_status = 'passed', updated_at = NOW()
         WHERE id = $1`,
        [id, JSON.stringify({
          sharpeRatio: result.sharpeRatio,
          maxDrawdown: result.maxDrawdown,
          winRate: result.winRate,
          totalPnlUsd: Math.round(result.totalPnlUsd),
          profitFactor: result.profitFactor,
          totalTrades: result.totalTrades,
          winningTrades: result.winningTrades,
          losingTrades: result.losingTrades,
          volatility: result.volatilityAnnual,
          totalReturn: result.totalReturn,
          backtestedAt: new Date().toISOString(),
        })],
      );

      logger.info('[Community] Backtest completed', { strategyId: id, sharpe: result.sharpeRatio });

      return res.json({
        strategyId: id,
        ...result,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[Community] Error running backtest', { error, id: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to run backtest' });
    }
  });
}

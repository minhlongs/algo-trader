/**
 * Community Strategy Read Routes
 * GET / (list approved) and GET /:id (detail) handlers.
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';

export function registerReadRoutes(router: RouterType): void {
  /** GET / — List approved community strategies */
  router.get('/', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10) || 20, 1), 100);
      const offset = Math.max(parseInt((req.query.offset as string) || '0', 10) || 0, 0);

      const db = getDbClient();
      const result = await db.query(
        `SELECT id, tenant_id, name, description, strategy_type, language, status,
                sandbox_status, backtest_result, created_at
         FROM community_strategies
         WHERE status = 'approved'
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      return res.json({
        data: result.rows.map((r: Record<string, unknown>) => ({
          id: r.id,
          tenantId: r.tenant_id,
          name: r.name,
          description: r.description,
          strategyType: r.strategy_type,
          language: r.language,
          status: r.status,
          sandboxStatus: r.sandbox_status,
          hasBacktest: r.backtest_result != null,
          createdAt: r.created_at,
        })),
        limit,
        offset,
      });
    } catch (error) {
      logger.error('[Community] Error listing strategies', { error });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to list strategies' });
    }
  });

  /** GET /:id — Get strategy details */
  router.get('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const db = getDbClient();

      const result = await db.query(
        `SELECT id, tenant_id, name, description, strategy_type, language, status,
                sandbox_status, backtest_result, review_notes, created_at, updated_at
         FROM community_strategies WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
      }

      const r = result.rows[0] as Record<string, unknown>;
      return res.json({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        description: r.description,
        strategyType: r.strategy_type,
        language: r.language,
        status: r.status,
        sandboxStatus: r.sandbox_status,
        backtestResult: r.backtest_result,
        reviewNotes: r.review_notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    } catch (error) {
      logger.error('[Community] Error getting strategy', { error, id: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to get strategy' });
    }
  });
}

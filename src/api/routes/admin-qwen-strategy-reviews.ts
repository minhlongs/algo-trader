/**
 * Admin Qwen Strategy Reviews Routes.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../shared/utils/logger';
import { query } from '../../shared/db/postgres-client';
import { qwenStrategyReviewsResolvedTotal } from '../../desk/middleware/prometheus-metrics';

export function registerAdminQwenStrategyReviewsRoutes(
  router: Router,
  requireAdminKey: (req: Request, res: Response) => boolean,
): void {
  /**
   * GET /strategy-reviews
   * Returns queued strategy review tasks for a given source and status.
   * Query params: status (default 'pending'), limit (default 50, max 200), source (default 'qwen-m1max')
   */
  router.get('/strategy-reviews', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    const status = (req.query.status as string) || 'pending';
    const source = (req.query.source as string) || 'qwen-m1max';
    const rawLimit = parseInt((req.query.limit as string) || '50', 10);
    const limit = isNaN(rawLimit) ? 50 : Math.min(rawLimit, 200);

    try {
      const result = await query<{
        id: string;
        source: string;
        trigger_reason: string;
        metrics: string;
        status: string;
        created_at: string;
        resolved_at: string | null;
      }>(
        `SELECT id, source, trigger_reason, metrics, status, created_at, resolved_at
         FROM strategy_review_tasks
         WHERE source = $1 AND status = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [source, status, limit]
      );

      res.json({ reviews: result.rows, count: result.rows.length });
    } catch (err) {
      logger.error('[AdminQwen] strategy-reviews query error', { err });
      res.status(500).json({ error: 'Failed to fetch strategy reviews' });
    }
  });

  /**
   * POST /strategy-reviews/:id/resolve
   * Closes a queued review task — flips status pending → resolved, stamps resolved_at.
   * Emits qwen_strategy_reviews_resolved_total{reason=...} counter on success.
   */
  router.post('/strategy-reviews/:id/resolve', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    const id = req.params.id;

    try {
      const result = await query<{
        id: string;
        source: string;
        trigger_reason: string;
        metrics: string;
        status: string;
        created_at: string;
        resolved_at: string;
      }>(
        `UPDATE strategy_review_tasks
         SET status = 'resolved', resolved_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, source, trigger_reason, metrics, status, created_at, resolved_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found or already resolved' });
      }

      const row = result.rows[0];
      qwenStrategyReviewsResolvedTotal.inc({ reason: row.trigger_reason });
      logger.info('[AdminQwen] Resolved strategy review', { id, reason: row.trigger_reason });
      return res.json({ resolved: row });
    } catch (err) {
      logger.error('[AdminQwen] strategy-reviews resolve error', { err, id });
      return res.status(500).json({ error: 'Failed to resolve strategy review' });
    }
  });
}

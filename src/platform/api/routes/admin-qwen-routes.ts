/**
 * Admin Qwen Routes — L1 kill switch + status endpoint.
 * Mounted at /api/v1/admin/qwen (admin tier only via X-Admin-Key header).
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../../shared/utils/logger';
import { disableQwen, enableQwen } from '../../../desk/wiring/qwen-drawdown-monitor';
import { evaluateAndQueue } from '../../../wiring/qwen-signals-loop.js';
import { query } from '../../../shared/db/postgres-client';
import {
  qwenStrategyReviewsResolvedTotal,
  qwenAdminKillActionsTotal,
} from '../../middleware/prometheus-metrics';
import { requireAdminKey } from './admin-qwen-auth';
import {
  fetchAdminQwenStatusData,
  fetchSignalsLoopRunsData,
} from './admin-qwen-runs-helper';

export { requireAdminKey } from './admin-qwen-auth';

export function createAdminQwenRouter(): Router {
  const router = Router();

  /** POST /kill — L1 kill switch + L2 disable */
  router.post('/kill', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    process.env.QWEN_KILL = '1';
    disableQwen('admin kill switch activated');
    qwenAdminKillActionsTotal.inc({ action: 'kill' });
    logger.warn('[AdminQwen] KILL SWITCH ACTIVATED by admin');
    res.json({ status: 'killed', qwenKill: '1', qwenEnabled: false });
  });

  /** POST /unkill — Clear kill switch + re-enable swarm */
  router.post('/unkill', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    process.env.QWEN_KILL = '0';
    enableQwen();
    qwenAdminKillActionsTotal.inc({ action: 'unkill' });
    logger.info('[AdminQwen] Kill switch cleared by admin');
    res.json({ status: 'cleared', qwenKill: '0', qwenEnabled: true });
  });

  /** GET /status — Qwen gate status */
  router.get('/status', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const data = await fetchAdminQwenStatusData();
      res.json(data);
    } catch (err) {
      logger.error('[AdminQwen] Status query error', { err });
      res.status(500).json({ error: 'Failed to fetch Qwen status' });
    }
  });

  /** GET /strategy-reviews — Queued review tasks */
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

  /** POST /strategy-reviews/:id/resolve — Close queued review task */
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

  /** GET /signals-loop/runs — Journal of qwen signals loop evaluation runs */
  router.get('/signals-loop/runs', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    const rawLimit = parseInt((req.query.limit as string) || '50', 10);
    const limit = isNaN(rawLimit) ? 50 : Math.min(rawLimit, 200);
    const decision = req.query.decision as string | undefined;

    try {
      const runs = await fetchSignalsLoopRunsData(limit, decision);
      res.json({ runs, total: runs.length });
    } catch (err) {
      logger.error('[AdminQwen] signals-loop/runs query error', { err });
      res.status(500).json({ error: 'Failed to fetch signals loop runs' });
    }
  });

  /** POST /signals-loop/trigger — Manually trigger signals loop evaluation */
  router.post('/signals-loop/trigger', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      await evaluateAndQueue('qwen-m1max');
      res.json({ status: 'queued', source: 'qwen-m1max' });
    } catch (err) {
      logger.error('[AdminQwen] signals-loop/trigger error', { err });
      res.status(500).json({ error: 'Failed to trigger signals loop' });
    }
  });

  return router;
}

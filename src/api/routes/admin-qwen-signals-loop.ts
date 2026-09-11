/**
 * Admin Qwen Signals Loop Routes.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../shared/utils/logger';
import { evaluateAndQueue } from '../../desk/wiring/qwen-signals-loop';
import { query } from '../../shared/db/postgres-client';

export function registerAdminQwenSignalsLoopRoutes(
  router: Router,
  requireAdminKey: (req: Request, res: Response) => boolean,
): void {
  /**
   * GET /signals-loop/runs
   * Returns journal of qwen signals loop evaluation runs.
   * Query params: limit (default 50, max 200), decision (optional filter)
   */
  router.get('/signals-loop/runs', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    const rawLimit = parseInt((req.query.limit as string) || '50', 10);
    const limit = isNaN(rawLimit) ? 50 : Math.min(rawLimit, 200);
    const decision = req.query.decision as string | undefined;

    try {
      let sql: string;
      let params: unknown[];

      if (decision) {
        sql = `SELECT id, source, ran_at, metrics, decision, trigger_reasons, error_message
               FROM qwen_signals_loop_runs
               WHERE decision = $1
               ORDER BY ran_at DESC
               LIMIT $2`;
        params = [decision, limit];
      } else {
        sql = `SELECT id, source, ran_at, metrics, decision, trigger_reasons, error_message
               FROM qwen_signals_loop_runs
               ORDER BY ran_at DESC
               LIMIT $1`;
        params = [limit];
      }

      const result = await query<{
        id: string;
        source: string;
        ran_at: string;
        metrics: string;
        decision: string;
        trigger_reasons: string;
        error_message: string | null;
      }>(sql, params);

      res.json({ runs: result.rows, total: result.rows.length });
    } catch (err) {
      logger.error('[AdminQwen] signals-loop/runs query error', { err });
      res.status(500).json({ error: 'Failed to fetch signals loop runs' });
    }
  });

  /**
   * POST /signals-loop/trigger
   * Manually triggers the signals loop evaluation for the default source.
   */
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
}

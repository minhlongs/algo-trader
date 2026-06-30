/**
 * Admin Qwen Routes — L1 kill switch + status endpoint.
 * Mounted at /api/v1/admin/qwen (admin tier only via X-Admin-Key header).
 *
 * POST /kill — set QWEN_KILL=1 in-process + disable swarm (L1+L2)
 * POST /unkill — clear kill flag + re-enable swarm (manual recovery)
 * GET /status — eligibility + enabled state + drawdown breach info
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../../shared/utils/logger';
import {
 disableQwen,
 enableQwen,
 isQwenEnabled,
 isKillSwitchActive,
 getLastBreachAt,
} from '../../../wiring/qwen-drawdown-monitor';
import { checkQwenEligibility } from '../../../wiring/qwen-live-eligibility-gate';
import { evaluateAndQueue } from '../../../wiring/qwen-signals-loop';
import { query } from '../../../shared/db/postgres-client';
import {
 qwenStrategyReviewsResolvedTotal,
 qwenAdminKillActionsTotal,
} from '../../middleware/prometheus-metrics';

/** Simple Express-compatible admin auth — checks X-Admin-Key header */
function requireAdminKey(req: Request, res: Response): boolean {
 const adminKey = process.env.ADMIN_API_KEY;
 if (!adminKey) {
 res.status(503).json({ error: 'Admin API not configured' });
 return false;
 }
 const provided = req.headers['x-admin-key'] as string | undefined;
 if (!provided || provided !== adminKey) {
 res.status(403).json({ error: 'Forbidden — invalid X-Admin-Key' });
 return false;
 }
 return true;
}

export function createAdminQwenRouter(): Router {
 const router = Router();

 /**
 * POST /kill
 * L1 kill switch: sets QWEN_KILL=1 in-process env + calls L2 disable.
 * All new Qwen signal ingestion is rejected with 503 while kill is active.
 */
 router.post('/kill', async (req: Request, res: Response) => {
 if (!requireAdminKey(req, res)) return;

 process.env.QWEN_KILL = '1';
 disableQwen('admin kill switch activated');
 qwenAdminKillActionsTotal.inc({ action: 'kill' });
 logger.warn('[AdminQwen] KILL SWITCH ACTIVATED by admin');

 res.json({ status: 'killed', qwenKill: '1', qwenEnabled: false });
 });

 /**
 * POST /unkill
 * Clear kill switch + re-enable swarm (requires manual admin action).
 */
 router.post('/unkill', async (req: Request, res: Response) => {
 if (!requireAdminKey(req, res)) return;

 process.env.QWEN_KILL = '0';
 enableQwen();
 qwenAdminKillActionsTotal.inc({ action: 'unkill' });
 logger.info('[AdminQwen] Kill switch cleared by admin');

 res.json({ status: 'cleared', qwenKill: '0', qwenEnabled: true });
 });

 /**
 * GET /status
 * Returns full Qwen gate status — eligibility, kill switch, drawdown breach.
 */
 router.get('/status', async (req: Request, res: Response) => {
 if (!requireAdminKey(req, res)) return;

 try {
 const eligibility = await checkQwenEligibility();

 res.json({
 killActive: isKillSwitchActive(),
 swarmEnabled: isQwenEnabled(),
 liveEligible: process.env.QWEN_LIVE_ELIGIBLE === 'true',
 eligibility,
 lastBreachAt: getLastBreachAt(),
 drawdownThresholdPct: parseFloat(process.env.QWEN_DRAWDOWN_MAX_PCT ?? '5'),
 autoApproveMaxUsd: parseFloat(process.env.QWEN_AUTO_APPROVE_MAX_USD ?? '500'),
 timestamp: Date.now(),
 });
 } catch (err) {
 logger.error('[AdminQwen] Status query error', { err });
 res.status(500).json({ error: 'Failed to fetch Qwen status' });
 }
 });

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
 *
 * 200: {resolved: row} — updated successfully.
 * 404: task not found (invalid id, or already resolved — WHERE status='pending' filters out).
 * 500: DB error.
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

/**
 * POST /signals-loop/trigger
 * Manually triggers evaluateAndQueue for the default source (qwen-m1max).
 */
router.post('/signals-loop/trigger', async (req: Request, res: Response) => {
 if (!requireAdminKey(req, res)) return;

 try {
 const source = 'qwen-m1max';
 await evaluateAndQueue(source);
 res.json({ status: 'queued', source });
 } catch (err) {
 logger.error('[AdminQwen] signals-loop/trigger error', { err });
 res.status(500).json({ error: 'Failed to trigger signals loop' });
 }
});

return router;
}

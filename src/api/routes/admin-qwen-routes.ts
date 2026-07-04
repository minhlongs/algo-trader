/**
 * Admin Qwen Routes — L1 kill switch + status endpoint.
 * Mounted at /api/v1/admin/qwen (admin tier only via X-Admin-Key header).
 *
 * POST /kill   — set QWEN_KILL=1 in-process + disable swarm (L1+L2)
 * POST /unkill — clear kill flag + re-enable swarm (manual recovery)
 * GET  /status — eligibility + enabled state + drawdown breach info
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import {
  disableQwen,
  enableQwen,
  isQwenEnabled,
  isKillSwitchActive,
  getLastBreachAt,
} from '../../wiring/qwen-drawdown-monitor';
import { checkQwenEligibility } from '../../wiring/qwen-live-eligibility-gate';

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
  router.post('/kill', (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    process.env.QWEN_KILL = '1';
    disableQwen('admin kill switch activated');
    logger.warn('[AdminQwen] KILL SWITCH ACTIVATED by admin');

    res.json({ status: 'killed', qwenKill: '1', qwenEnabled: false });
  });

  /**
   * POST /unkill
   * Clear kill switch + re-enable swarm (requires manual admin action).
   */
  router.post('/unkill', (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    process.env.QWEN_KILL = '0';
    enableQwen();
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

  return router;
}

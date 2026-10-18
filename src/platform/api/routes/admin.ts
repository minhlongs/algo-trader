/**
 * Admin Routes
 * POST /admin/halt - Halt trading
 * POST /admin/resume - Resume trading
 * GET /admin/status - Get system status
 * GET /admin/circuit-breakers - List circuit breakers
 * POST /admin/circuit-breakers/:name/reset - Reset circuit breaker
 * POST /admin/circuit-breakers/reset-all - Reset all circuit breakers
 */

import { Router, Request, Response } from 'express';
import { CircuitBreaker } from '../../../desk/risk/circuit-breaker';
import { DrawdownMonitor } from '../../../desk/risk/drawdown-monitor';
import { requireAdminKey } from '../middleware/require-admin-key';
import { logger } from '../../../shared/utils/logger';
import {
  haltSchema,
  resetBreakerNameSchema,
  logAdminTradingAudit,
  formatAdminStatusPayload,
  extractAdminErrorMessage,
} from './admin-helpers';

export {
  haltSchema,
  resetBreakerNameSchema,
  logAdminTradingAudit,
  formatAdminStatusPayload,
  extractAdminErrorMessage,
} from './admin-helpers';

export const adminRouter: Router = Router();
const circuitBreaker = new CircuitBreaker();
const drawdownMonitor = new DrawdownMonitor();

/**
 * POST /admin/halt
 * Body: reason (required)
 */
adminRouter.post('/halt', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  try {
    const parsed = haltSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
    }

    await circuitBreaker.halt(parsed.data.reason);
    await logAdminTradingAudit('admin_halt', { reason: parsed.data.reason });

    res.json({ success: true, message: `Trading halted: ${parsed.data.reason}` });
  } catch (error) {
    logger.error('[Admin] Halt trading failed', { error: String(error) });
    res.status(500).json({ error: extractAdminErrorMessage(error, 'Failed to halt trading') });
  }
});

/**
 * POST /admin/resume
 */
adminRouter.post('/resume', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  try {
    await circuitBreaker.reset();
    await drawdownMonitor.resume();
    await logAdminTradingAudit('admin_resume', {});

    res.json({ success: true, message: 'Trading resumed' });
  } catch (error) {
    logger.error('[Admin] Resume trading failed', { error: String(error) });
    res.status(500).json({ error: extractAdminErrorMessage(error, 'Failed to resume trading') });
  }
});

/**
 * GET /admin/status
 */
adminRouter.get('/status', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  try {
    const [circuitStatus, drawdownMetrics] = await Promise.all([
      circuitBreaker.getStatus(),
      drawdownMonitor.getMetrics(),
    ]);
    res.json(formatAdminStatusPayload(circuitStatus, drawdownMetrics));
  } catch (error) {
    res.status(500).json({ error: extractAdminErrorMessage(error, 'Failed to fetch status') });
  }
});

/**
 * GET /admin/circuit-breakers
 * List circuit breaker(s) with current state.
 */
adminRouter.get('/circuit-breakers', requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const status = await circuitBreaker.getStatus();
    res.json([{ name: 'default', ...status }]);
  } catch (error) {
    logger.error('[Admin] List circuit breakers failed', { error: String(error) });
    res.status(500).json({ error: 'Failed to list circuit breakers' });
  }
});

/**
 * POST /admin/circuit-breakers/:name/reset
 * Reset a circuit breaker back to CLOSED.
 */
adminRouter.post('/circuit-breakers/:name/reset', requireAdminKey, async (req: Request, res: Response) => {
  try {
    const parsed = resetBreakerNameSchema.safeParse({ name: req.params.name });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid name' });
    }

    await circuitBreaker.reset();
    res.json({ success: true, name: parsed.data.name, state: 'CLOSED' });
  } catch (error) {
    logger.error('[Admin] Reset circuit breaker failed', { error: String(error) });
    res.status(500).json({ error: 'Failed to reset circuit breaker' });
  }
});

/**
 * POST /admin/circuit-breakers/reset-all
 * Reset all circuit breakers to CLOSED.
 */
adminRouter.post('/circuit-breakers/reset-all', requireAdminKey, async (_req: Request, res: Response) => {
  try {
    await circuitBreaker.reset();
    res.json({ success: true, message: 'All circuit breakers reset', state: 'CLOSED' });
  } catch (error) {
    logger.error('[Admin] Reset all circuit breakers failed', { error: String(error) });
    res.status(500).json({ error: 'Failed to reset all circuit breakers' });
  }
});

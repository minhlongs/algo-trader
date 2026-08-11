/**
 * Admin Routes
 * POST /admin/halt - Halt trading
 * POST /admin/resume - Resume trading
 * GET /admin/status - Get system status
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CircuitBreaker } from '../../../desk/risk/circuit-breaker';
import { DrawdownMonitor } from '../../../desk/risk/drawdown-monitor';
import { requireAdminKey } from '../middleware/require-admin-key';
import crypto from 'crypto';
import { logAudit, hashIpAddress } from '../../../seed/security/audit-log';
import type { IAuditEntry } from '../../../seed/security/audit-log';

// Zod schemas for request body validation
const haltSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
});

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

    await logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'admin',
      action: 'admin_halt',
      resource: 'Trading',
      result: 'success',
      metadata: {
        reason: parsed.data.reason,
      },
      ipHash: hashIpAddress(undefined),
      tenantId: 'system-tenant',
    } as IAuditEntry);

    res.json({ success: true, message: `Trading halted: ${parsed.data.reason}` });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to halt trading',
    });
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

    await logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'admin',
      action: 'admin_resume',
      resource: 'Trading',
      result: 'success',
      metadata: {},
      ipHash: hashIpAddress(undefined),
      tenantId: 'system-tenant',
    } as IAuditEntry);

    res.json({ success: true, message: 'Trading resumed' });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to resume trading',
    });
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

    res.json({
      trading: circuitStatus.state === 'CLOSED' && !drawdownMetrics.isHalted,
      circuitBreaker: circuitStatus,
      drawdown: drawdownMetrics,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch status',
    });
  }
});

/**
 * Admin Marketplace Routes
 *
 * Admin-only endpoints for marketplace oversight:
 * - GET /strategies/pending - List pending vetting strategies
 * - POST /strategies/:id/vetting/decision - Approve/reject strategy
 * - GET /strategies/:id/history - Vetting audit trail
 * - GET /disputes - List all disputes
 * - PATCH /disputes/:id/resolve - Resolve dispute
 * - PATCH /disputes/:id/escalate - Escalate dispute
 * - GET /revenue - Platform revenue overview
 * - GET /revenue/creators - All creator payouts
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { VettingService } from '../../marketplace/services/vetting.service';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { RevenueService } from '../../marketplace/services/revenue.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../utils/logger';

export const adminMarketplaceRouter: RouterType = Router();

const marketplaceService = MarketplaceService.getInstance();
const vettingService = VettingService.getInstance();
const disputeService = DisputeService.getInstance();
const revenueService = RevenueService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

const vettingDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().max(5000).optional(),
});

const resolveDisputeSchema = z.object({
  resolution: z.string().min(10).max(5000),
  compensationType: z.enum(['full_refund', 'partial_refund', 'credit', 'none']).optional(),
  compensationAmountCents: z.number().int().min(0).optional(),
  adminNotes: z.string().max(5000).optional(),
});

const disputeFilterSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed']).optional(),
});

const revenueFilterSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

// ==================== Helper Functions ====================

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

function getUserId(req: Request): string {
  const userId = (req as any).user?.id || (req as any).apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return String(userId);
}

function isAdmin(req: Request): boolean {
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
}

function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

// ==================== Routes ====================

/**
 * GET /api/admin/marketplace/strategies/pending
 * List pending vetting strategies
 */
adminMarketplaceRouter.get('/strategies/pending', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const page = parseInt(getQueryString(req.query.page, '1')) || 1;
    const limit = parseInt(getQueryString(req.query.limit, '50')) || 50;

    const result = await marketplaceService.listStrategies({
      status: 'pending_vetting',
      page,
      limit,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error listing pending strategies', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list pending strategies',
    });
  }
});

/**
 * POST /api/admin/marketplace/strategies/:id/vetting/decision
 * Approve or reject a strategy
 */
adminMarketplaceRouter.post('/strategies/:id/vetting/decision', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const id = getQueryString(req.params.id);
    const adminUserId = getUserId(req);

    const parsed = vettingDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const strategy = await marketplaceService.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    if (strategy.status !== 'pending_vetting') {
      return res.status(400).json({
        error: 'Invalid state',
        message: `Strategy is not pending vetting (current: ${strategy.status})`,
      });
    }

    let updated;
    if (parsed.data.decision === 'approve') {
      updated = await vettingService.approveStrategy(id, adminUserId, parsed.data.notes);
    } else {
      updated = await vettingService.rejectStrategy(id, adminUserId, parsed.data.notes || 'Rejected');
    }

    await auditService.log(
      strategy.tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: `vetting_${parsed.data.decision}d`,
          adminUserId,
          resourceId: id,
          strategyName: strategy.name,
          notes: parsed.data.notes,
        },
      }
    );

    logger.info('[MarketplaceAdmin] Vetting decision recorded', {
      strategyId: id,
      decision: parsed.data.decision,
      adminUserId,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error recording vetting decision', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record vetting decision',
    });
  }
});

/**
 * GET /api/admin/marketplace/strategies/:id/history
 * Vetting audit trail for a strategy
 */
adminMarketplaceRouter.get('/strategies/:id/history', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const id = getQueryString(req.params.id);

    const history = await vettingService.getVettingHistory(id);
    return res.json(history);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error getting vetting history', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get vetting history',
    });
  }
});

/**
 * GET /api/admin/marketplace/disputes
 * List all disputes (admin view)
 */
adminMarketplaceRouter.get('/disputes', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const parsed = disputeFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const page = parseInt(getQueryString(req.query.page, '1')) || 1;
    const limit = parseInt(getQueryString(req.query.limit, '50')) || 50;

    const result = await disputeService.listAllDisputes({
      status: parsed.data.status,
      page,
      limit,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error listing disputes', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list disputes',
    });
  }
});

/**
 * PATCH /api/admin/marketplace/disputes/:id/resolve
 * Resolve a dispute
 */
adminMarketplaceRouter.patch('/disputes/:id/resolve', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const id = getQueryString(req.params.id);
    const adminUserId = getUserId(req);

    const parsed = resolveDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const dispute = await disputeService.getDispute(getQueryString(req.params.id));
    if (!dispute) {
      return res.status(404).json({
        error: 'Not found',
        message: `Dispute ${id} not found`,
      });
    }

    const updated = await disputeService.resolveDispute(id, {
      resolution: parsed.data.resolution,
      compensationType: parsed.data.compensationType || 'none',
      compensationAmountCents: parsed.data.compensationAmountCents,
      resolvedBy: adminUserId,
      adminNotes: parsed.data.adminNotes,
    });

    await auditService.log(
      dispute.tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'dispute_resolved',
          adminUserId,
          resourceId: id,
          resolution: parsed.data.resolution,
          compensationType: parsed.data.compensationType,
        },
      }
    );

    logger.info('[MarketplaceAdmin] Dispute resolved', {
      disputeId: id,
      adminUserId,
      compensationType: parsed.data.compensationType,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error resolving dispute', { error, disputeId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to resolve dispute',
    });
  }
});

/**
 * PATCH /api/admin/marketplace/disputes/:id/escalate
 * Escalate a dispute
 */
adminMarketplaceRouter.patch('/disputes/:id/escalate', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const id = getQueryString(req.params.id);
    const adminUserId = getUserId(req);

    const dispute = await disputeService.getDispute(getQueryString(req.params.id));
    if (!dispute) {
      return res.status(404).json({
        error: 'Not found',
        message: `Dispute ${id} not found`,
      });
    }

    const updated = await disputeService.escalateDispute(id, adminUserId);

    await auditService.log(
      dispute.tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'dispute_escalated',
          adminUserId,
          resourceId: id,
        },
      }
    );

    logger.info('[MarketplaceAdmin] Dispute escalated', { disputeId: id, adminUserId });

    return res.json(updated);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error escalating dispute', { error, disputeId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to escalate dispute',
    });
  }
});

/**
 * GET /api/admin/marketplace/revenue
 * Platform revenue overview
 */
adminMarketplaceRouter.get('/revenue', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const parsed = revenueFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const overview = await revenueService.getRevenueOverview({
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
    });

    return res.json(overview);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error getting revenue overview', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get revenue overview',
    });
  }
});

/**
 * GET /api/admin/marketplace/revenue/creators
 * All creator payouts
 */
adminMarketplaceRouter.get('/revenue/creators', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const payouts = await revenueService.getAllCreatorPayouts();
    return res.json(payouts);
  } catch (error) {
    logger.error('[MarketplaceAdmin] Error getting creator payouts', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get creator payouts',
    });
  }
});

export default adminMarketplaceRouter;

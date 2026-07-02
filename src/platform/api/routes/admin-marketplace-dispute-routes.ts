/**
 * Admin Marketplace — Dispute Routes
 *
 * Routes:
 * - GET /disputes — List all disputes
 * - PATCH /disputes/:id/resolve — Resolve dispute
 * - PATCH /disputes/:id/escalate — Escalate dispute
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTenantId,
  getUserId,
  isAdmin,
  getQueryString,
} from './admin-marketplace-helpers';

const disputeService = DisputeService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10).max(5000),
  compensationType: z.enum(['full_refund', 'partial_refund', 'credit', 'none']).optional(),
  compensationAmountCents: z.number().int().min(0).optional(),
  adminNotes: z.string().max(5000).optional(),
});

export const disputeFilterSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed']).optional(),
});

// ==================== Route Registration ====================

export function registerMarketplaceDisputeRoutes(router: RouterType): void {
  /**
   * GET /api/admin/marketplace/disputes
   * List all disputes (admin view)
   */
  router.get('/disputes', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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
  router.patch('/disputes/:id/resolve', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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
  router.patch('/disputes/:id/escalate', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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
}

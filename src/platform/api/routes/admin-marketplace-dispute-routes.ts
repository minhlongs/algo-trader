/**
 * Admin Marketplace — Dispute Routes
 *
 * Routes:
 * - GET /disputes — List all disputes
 * - PATCH /disputes/:id/resolve — Resolve dispute
 * - PATCH /disputes/:id/escalate — Escalate dispute
 */

import type { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { AuditLogService } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  isAdmin,
  getQueryString,
} from './admin-marketplace-helpers';
import {
  resolveDisputeSchema,
  disputeFilterSchema,
  type ResolveDisputeInput,
  type DisputeFilterInput,
} from './admin-marketplace-dispute-schemas';
import {
  handleResolveDispute,
  handleEscalateDispute,
} from './admin-marketplace-dispute-actions';

export { resolveDisputeSchema, disputeFilterSchema };
export type { ResolveDisputeInput, DisputeFilterInput };
export { handleResolveDispute, handleEscalateDispute };

const disputeService = DisputeService.getInstance();
const auditService = AuditLogService.getInstance();

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
    return handleResolveDispute(req, res, disputeService, auditService);
  });

  /**
   * PATCH /api/admin/marketplace/disputes/:id/escalate
   * Escalate a dispute
   */
  router.patch('/disputes/:id/escalate', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    return handleEscalateDispute(req, res, disputeService, auditService);
  });
}


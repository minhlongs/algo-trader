/**
 * Marketplace Dispute Routes
 *
 * Endpoints:
 * - POST / - File a dispute
 * - GET / - List my disputes
 * - GET /:id - Get dispute details
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';

export const marketplaceDisputeRouter: RouterType = Router();

const disputeService = DisputeService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

const fileDisputeSchema = z.object({
  listingId: z.string().min(1),
  subscriptionId: z.string().min(1),
  reason: z.enum([
    'performance_not_as_described',
    'unauthorized_charges',
    'poor_support',
    'strategy_broken',
    'other',
  ]),
  description: z.string().min(20).max(5000),
  evidenceUrls: z.array(z.string().url()).max(10).optional(),
});

const disputeFilterSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
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

function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

function getQueryNumber(value: unknown, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return parseInt(first, 10) || defaultValue;
    if (typeof first === 'number') return first;
    return defaultValue;
  }
  if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
  if (typeof value === 'number') return value;
  return defaultValue;
}

function isAdmin(req: Request): boolean {
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
}

// ==================== Routes ====================

/**
 * POST /api/v1/marketplace/disputes
 * File a dispute against a strategy subscription
 */
marketplaceDisputeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = fileDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const { listingId, subscriptionId, reason, description, evidenceUrls } = parsed.data;

    // Verify subscription belongs to tenant
    const subscription = await disputeService.getSubscriptionForDispute(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        error: 'Not found',
        message: `Subscription ${subscriptionId} not found`,
      });
    }

    if (subscription.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only file disputes for your own subscriptions',
      });
    }

    const dispute = await disputeService.fileDispute({
      tenantId,
      listingId,
      subscriptionId,
      reason,
      description,
      evidenceUrls,
    });

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'dispute_filed',
          userId,
          resourceId: dispute.id,
          listingId,
          subscriptionId,
          reason,
        },
      }
    );

    logger.info('[Marketplace] Dispute filed', {
      disputeId: dispute.id,
      tenantId,
      listingId,
      reason,
    });

    return res.status(201).json(dispute);
  } catch (error) {
    logger.error('[Marketplace] Error filing dispute', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to file dispute',
    });
  }
});

/**
 * GET /api/v1/marketplace/disputes
 * List my disputes
 */
marketplaceDisputeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const parsed = disputeFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const filters = parsed.data;
    const result = await disputeService.listDisputes(tenantId, {
      status: filters.status,
      page: filters.page || 1,
      limit: filters.limit || 20,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[Marketplace] Error listing disputes', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list disputes',
    });
  }
});

/**
 * GET /api/v1/marketplace/disputes/:id
 * Get dispute details
 */
marketplaceDisputeRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);

    const dispute = await disputeService.getDispute(id);
    if (!dispute) {
      return res.status(404).json({
        error: 'Not found',
        message: `Dispute ${id} not found`,
      });
    }

    if (dispute.tenantId !== tenantId && !isAdmin(req)) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Dispute not found',
      });
    }

    return res.json(dispute);
  } catch (error) {
    logger.error('[Marketplace] Error getting dispute', {
      error,
      disputeId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get dispute',
    });
  }
});

export default marketplaceDisputeRouter;

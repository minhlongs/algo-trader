import type { Request, Response } from 'express';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import {
  fileDisputeSchema,
  disputeFilterSchema,
  getTenantId,
  getUserId,
  getQueryString,
  isAdmin,
} from './marketplace-dispute-schemas';

const disputeService = DisputeService.getInstance();
const auditService = AuditLogService.getInstance();

export async function handleFileDispute(req: Request, res: Response): Promise<Response | void> {
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

    const userTier = (req as unknown as { user?: { tier?: string } }).user?.tier;
    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: userTier,
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
}

export async function handleListDisputes(req: Request, res: Response): Promise<Response | void> {
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
}

export async function handleGetDispute(req: Request, res: Response): Promise<Response | void> {
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
}

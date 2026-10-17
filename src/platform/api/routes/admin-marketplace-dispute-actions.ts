import type { Request, Response } from 'express';
import { DisputeService } from '../../marketplace/services/dispute.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { getUserId, isAdmin, getQueryString } from './admin-marketplace-helpers';
import { resolveDisputeSchema } from './admin-marketplace-dispute-schemas';

export async function handleResolveDispute(
  req: Request,
  res: Response,
  disputeService: DisputeService,
  auditService: AuditLogService,
): Promise<Response> {
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
        tier: (req as Request & { user?: { tier?: string } }).user?.tier,
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
}

export async function handleEscalateDispute(
  req: Request,
  res: Response,
  disputeService: DisputeService,
  auditService: AuditLogService,
): Promise<Response> {
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
        tier: (req as Request & { user?: { tier?: string } }).user?.tier,
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
}

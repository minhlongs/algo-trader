import { Router, Request, Response } from 'express';
import { query } from '../../db/postgres-client.js';
import { LicenseService } from '@platform/billing/license-service';
import { AuditLogService } from '@platform/audit/audit-log-service';
import { logger } from '@platform/utils/logger';
import {
  auditLogQuerySchema,
  auditExportQuerySchema,
  extractTokenClaims,
} from './audit-routes-schemas';
import { handleAuditExport } from './audit-routes-export';

export * from './audit-routes-schemas';
export * from './audit-routes-export';

export const auditRouter: Router = Router();
const auditService = AuditLogService.getInstance();
const licenseService = LicenseService.getInstance();

/**
 * GET /api/v1/audit/logs
 */
auditRouter.get('/logs', async (req: Request, res: Response) => {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
  }

  const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
  const targetTenantId = parsed.data.tenantId || tokenSubscriberId;

  if (!isAdmin) {
    if (!targetTenantId) {
      return res.status(403).json({ error: 'TenantIsolator: no subscriber identity in token' });
    }
    if (parsed.data.tenantId && parsed.data.tenantId !== tokenSubscriberId) {
      return res.status(403).json({
        error: `TenantIsolator: cross-tenant access denied - token=${tokenSubscriberId} requested=${parsed.data.tenantId}`,
      });
    }
  }

  try {
    let sql = 'SELECT * FROM tenant_audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (targetTenantId) {
      params.push(targetTenantId);
      sql += ` AND tenant_id = $${params.length}`;
    }

    if (parsed.data.eventType) {
      params.push(parsed.data.eventType);
      sql += ` AND event_type = $${params.length}`;
    }

    if (parsed.data.startDate) {
      params.push(parsed.data.startDate);
      sql += ` AND created_at >= $${params.length}`;
    }

    if (parsed.data.endDate) {
      params.push(parsed.data.endDate);
      sql += ` AND created_at <= $${params.length}`;
    }

    // Keyset pagination conditions
    if (targetTenantId && parsed.data.cursorSeq !== undefined) {
      params.push(parsed.data.cursorSeq);
      sql += ` AND sequence_number < $${params.length}`;
    } else if (parsed.data.cursorCreated && parsed.data.cursorId) {
      params.push(parsed.data.cursorCreated, parsed.data.cursorId);
      sql += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
    }

    if (targetTenantId) {
      sql += ' ORDER BY sequence_number DESC';
    } else {
      sql += ' ORDER BY created_at DESC, id DESC';
    }

    params.push(parsed.data.limit);
    sql += ` LIMIT $${params.length}`;

    const dbResult = await query(sql, params);
    const logs = dbResult.rows.map((row) => {
      const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        sequence_number: parseInt(row.sequence_number as string, 10),
        event_type: row.event_type,
        action_by: row.action_by,
        reason: row.reason,
        metadata,
        hash: row.hash,
        previous_hash: row.previous_hash,
        created_at: row.created_at,
      };
    });

    const hasMore = logs.length === parsed.data.limit;
    let nextCursor = null;
    if (hasMore && logs.length > 0) {
      const lastLog = logs[logs.length - 1];
      if (targetTenantId) {
        nextCursor = { cursorSeq: lastLog.sequence_number };
      } else {
        nextCursor = {
          cursorCreated: lastLog.created_at,
          cursorId: lastLog.id,
        };
      }
    }

    return res.json({
      logs,
      total: logs.length,
      nextCursor,
    });
  } catch (error) {
    logger.error('[AuditRouter] Error querying logs:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
});

/**
 * GET /api/v1/audit/logs/:id
 */
auditRouter.get('/logs/:id', async (_req: Request, res: Response) => {
  return res.status(501).json({
    error: 'Not Implemented',
    message: 'Get single audit log by ID is not implemented',
  });
});

/**
 * GET /api/v1/audit/export
 */
auditRouter.get('/export', handleAuditExport);

/**
 * GET /api/v1/audit/license/:id/audit
 */
auditRouter.get('/license/:id/audit', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);

  if (!license) {
    return res.status(404).json({
      error: 'Not Found',
      message: `License ${licenseId} not found`,
    });
  }

  const logs = await auditService.getLogsByLicense(licenseId);

  return res.json({ logs });
});

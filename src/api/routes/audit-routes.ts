import { Router, Request, Response } from 'express';
import { getDbClient, query } from '../../db/postgres-client.js';
import { LicenseService } from '@platform/billing/license-service';
import { AuditLogService } from '@platform/audit/audit-log-service';
import { z } from 'zod';
import QueryStream from 'pg-query-stream';
import { logger } from '@platform/utils/logger';

export const auditRouter: Router = Router();
const auditService = AuditLogService.getInstance();
const licenseService = LicenseService.getInstance();

const auditLogQuerySchema = z.object({
  tenantId: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursorSeq: z.coerce.number().int().optional(),
  cursorCreated: z.string().optional(),
  cursorId: z.string().uuid().optional(),
});

const auditExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
  tenantId: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

function extractTokenClaims(req: Request): {
  tokenSubscriberId: string | null;
  isAdmin: boolean;
} {
  const claims = (req as Request & { claims?: { sub?: string; role?: string } }).claims;
  return {
    tokenSubscriberId: claims?.sub ?? null,
    isAdmin: claims?.role === 'admin',
  };
}

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
    const logs = dbResult.rows.map(row => {
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
auditRouter.get('/logs/:id', async (req: Request, res: Response) => {
  return res.status(501).json({
    error: 'Not Implemented',
    message: 'Get single audit log by ID is not implemented',
  });
});

/**
 * GET /api/v1/audit/export
 */
auditRouter.get('/export', async (req: Request, res: Response) => {
  const parsed = auditExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
  }

  const { format } = parsed.data;
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

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `audit-logs-${timestamp}.${format}`;
  const contentType = format === 'csv' ? 'text/csv' : 'application/json';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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

  if (targetTenantId) {
    sql += ' ORDER BY sequence_number DESC';
  } else {
    sql += ' ORDER BY created_at DESC, id DESC';
  }

  const client = await getDbClient().connect();
  const queryStream = new QueryStream(sql, params);
  const stream = client.query(queryStream) as unknown as NodeJS.ReadWriteStream;

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) {
      return '';
    }
    let str = '';
    if (typeof val === 'object') {
      str = JSON.stringify(val);
    } else {
      str = String(val);
    }
    if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let first = true;

  if (format === 'csv') {
    res.write('id,tenant_id,sequence_number,event_type,action_by,reason,metadata,hash,previous_hash,created_at\n');
  } else {
    res.write('[');
  }

  stream.on('data', (row: Record<string, unknown>) => {
    try {
      if (format === 'csv') {
        const metadataStr = typeof (row as Record<string, unknown>).metadata === 'string'
          ? (row as Record<string, unknown>).metadata as string
          : JSON.stringify((row as Record<string, unknown>).metadata || {});
        const line = [
          (row as Record<string, unknown>).id,
          (row as Record<string, unknown>).tenant_id,
          parseInt((row as Record<string, unknown>).sequence_number as string, 10),
          (row as Record<string, unknown>).event_type,
          (row as Record<string, unknown>).action_by,
          (row as Record<string, unknown>).reason || '',
          metadataStr,
          (row as Record<string, unknown>).hash,
          (row as Record<string, unknown>).previous_hash || '',
					new Date((row as Record<string, unknown>).created_at as string | Date).toISOString(),
        ].map(escapeCsv).join(',');
        res.write(line + '\n');
      } else {
        if (!first) {
          res.write(',');
        }
        first = false;
        const metadata = typeof (row as Record<string, unknown>).metadata === 'string'
          ? JSON.parse((row as Record<string, unknown>).metadata as string)
          : (row as Record<string, unknown>).metadata;
        const formatted = {
          id: (row as Record<string, unknown>).id,
          tenant_id: (row as Record<string, unknown>).tenant_id,
          sequence_number: parseInt((row as Record<string, unknown>).sequence_number as string, 10),
          event_type: (row as Record<string, unknown>).event_type,
          action_by: (row as Record<string, unknown>).action_by,
          reason: (row as Record<string, unknown>).reason,
          metadata,
          hash: (row as Record<string, unknown>).hash,
          previous_hash: (row as Record<string, unknown>).previous_hash,
          created_at: (row as Record<string, unknown>).created_at,
        };
        res.write(JSON.stringify(formatted));
      }
    } catch (err) {
      logger.error('[AuditRouter] Error serializing export row:', err);
    }
  });

  stream.on('end', () => {
    if (format === 'json') {
      res.write(']');
    }
    res.end();
    client.release();
  });

  stream.on('error', (err: Error) => {
    logger.error('[AuditRouter] Export stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream processing failed' });
    }
    client.release();
  });
});

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

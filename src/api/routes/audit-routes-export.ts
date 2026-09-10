import { Request, Response } from 'express';
import QueryStream from 'pg-query-stream';
import { getDbClient } from '../../db/postgres-client.js';
import { logger } from '@platform/utils/logger';
import { auditExportQuerySchema, extractTokenClaims } from './audit-routes-schemas';

function escapeCsv(val: unknown): string {
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
}

/**
 * Handler for GET /api/v1/audit/export
 */
export async function handleAuditExport(req: Request, res: Response): Promise<void> {
  const parsed = auditExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
    return;
  }

  const { format } = parsed.data;
  const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
  const targetTenantId = parsed.data.tenantId || tokenSubscriberId;

  if (!isAdmin) {
    if (!targetTenantId) {
      res.status(403).json({ error: 'TenantIsolator: no subscriber identity in token' });
      return;
    }
    if (parsed.data.tenantId && parsed.data.tenantId !== tokenSubscriberId) {
      res.status(403).json({
        error: `TenantIsolator: cross-tenant access denied - token=${tokenSubscriberId} requested=${parsed.data.tenantId}`,
      });
      return;
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

  let first = true;

  if (format === 'csv') {
    res.write('id,tenant_id,sequence_number,event_type,action_by,reason,metadata,hash,previous_hash,created_at\n');
  } else {
    res.write('[');
  }

  stream.on('data', (row: Record<string, unknown>) => {
    try {
      if (format === 'csv') {
        const metadataStr =
          typeof row.metadata === 'string'
            ? (row.metadata as string)
            : JSON.stringify(row.metadata || {});
        const line = [
          row.id,
          row.tenant_id,
          parseInt(row.sequence_number as string, 10),
          row.event_type,
          row.action_by,
          row.reason || '',
          metadataStr,
          row.hash,
          row.previous_hash || '',
          new Date(row.created_at as string | Date).toISOString(),
        ].map(escapeCsv).join(',');
        res.write(line + '\n');
      } else {
        if (!first) {
          res.write(',');
        }
        first = false;
        const metadata =
          typeof row.metadata === 'string'
            ? JSON.parse(row.metadata as string)
            : row.metadata;
        const formatted = {
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
}

import { Request, Response } from 'express';
import QueryStream from 'pg-query-stream';
import { getDbClient } from '../../db/postgres-client.js';
import { logger } from '@platform/utils/logger';
import { auditExportQuerySchema, extractTokenClaims } from './audit-routes-schemas';
import {
  CSV_HEADER,
  escapeCsv,
  buildAuditExportQuery,
  formatAuditRowCsv,
  formatAuditRowJson,
} from './audit-routes-export-helpers';

export { CSV_HEADER, escapeCsv, buildAuditExportQuery, formatAuditRowCsv, formatAuditRowJson };

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

  const { sql, params } = buildAuditExportQuery(parsed.data, targetTenantId);

  const client = await getDbClient().connect();
  const queryStream = new QueryStream(sql, params);
  const stream = client.query(queryStream) as unknown as NodeJS.ReadWriteStream;

  let first = true;
  res.write(format === 'csv' ? CSV_HEADER : '[');

  stream.on('data', (row: Record<string, unknown>) => {
    try {
      if (format === 'csv') {
        res.write(formatAuditRowCsv(row) + '\n');
      } else {
        if (!first) res.write(',');
        first = false;
        res.write(formatAuditRowJson(row));
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

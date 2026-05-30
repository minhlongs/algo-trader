import { Router, Request, Response } from 'express';
import { AuditLogService, AuditLogFilters } from '../../audit/audit-log-service';
import { LicenseService } from '../../billing/license-service';
import { z } from 'zod';

export const auditRouter: Router = Router();
const auditService = AuditLogService.getInstance();
const licenseService = LicenseService.getInstance();

const auditLogQuerySchema = z.object({
  licenseId: z.string().optional(),
  eventType: z.enum(['all', 'created', 'activated', 'revoked', 'api_call', 'ml_feature', 'rate_limit', 'deleted', 'suspension_warning', 'suspended', 'reinstated']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

const auditExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
  licenseId: z.string().optional(),
  eventType: z.enum(['all', 'created', 'activated', 'revoked', 'api_call', 'ml_feature', 'rate_limit', 'deleted', 'suspension_warning', 'suspended', 'reinstated']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * GET /api/v1/audit/logs
 */
auditRouter.get('/logs', async (req: Request, res: Response) => {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
  }

  const filters: AuditLogFilters = {
    licenseId: parsed.data.licenseId as string | undefined,
    eventType: parsed.data.eventType,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    limit: parsed.data.limit,
    skip: parsed.data.skip,
  };

  const logs = await auditService.getAllLogs(filters);

  return res.json({
    logs,
    total: logs.length,
    hasMore: logs.length === filters.limit,
  });
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
  const filters: AuditLogFilters = {
    licenseId: parsed.data.licenseId as string | undefined,
    eventType: parsed.data.eventType,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    limit: 10000, // Higher limit for exports
  };

  const logs = await auditService.getAllLogs(filters);
  let content: string;
  let contentType: string;

  if (format === 'csv') {
    content = auditService.exportToCsv(logs);
    contentType = 'text/csv';
  } else {
    content = auditService.exportToJson(logs);
    contentType = 'application/json';
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `audit-logs-${timestamp}.${format}`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(content);
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

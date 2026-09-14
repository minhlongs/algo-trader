import { Router, Request, Response } from 'express';
import { LicenseService } from '@platform/billing/license-service';
import { AuditLogService } from '@platform/audit/audit-log-service';
import { LicenseTier, LicenseStatus, LicenseFilters } from '@platform/types/license';
import { createLicenseBodySchema, listLicenseQuerySchema } from './license-routes-schemas';
import { emitLicenseAudit } from './license-routes-audit';

export { createLicenseBodySchema, listLicenseQuerySchema } from './license-routes-schemas';
export { emitLicenseAudit } from './license-routes-audit';

export const licenseRouter: Router = Router();
const licenseService = LicenseService.getInstance();
const auditService = AuditLogService.getInstance();

licenseRouter.get('/analytics', async (_req: Request, res: Response) => {
  const analytics = await licenseService.getAnalytics();
  return res.json(analytics);
});

licenseRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listLicenseQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
  }

  const filters: LicenseFilters = {
    take: parsed.data.take,
    skip: parsed.data.skip,
    status: parsed.data.status as LicenseStatus | 'all',
    tier: parsed.data.tier as LicenseTier | 'all',
  };

  const result = await licenseService.listLicenses(filters);
  return res.json(result);
});

licenseRouter.get('/:id', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }
  return res.json(license);
});

licenseRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createLicenseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }

  const { name, tier, expiresAt, tenantId, domain } = parsed.data;
  const license = await licenseService.createLicense({
    name,
    tier: tier as LicenseTier,
    expiresAt,
    tenantId,
    domain,
  });

  await emitLicenseAudit(auditService, 'created', license, name);
  return res.status(201).json(license);
});

licenseRouter.patch('/:id/revoke', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = await licenseService.revokeLicense(licenseId);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${req.params.id} not found` });
  }

  await emitLicenseAudit(auditService, 'revoked', license);
  return res.json(license);
});

licenseRouter.delete('/:id', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }

  await emitLicenseAudit(auditService, 'deleted', license);
  await licenseService.deleteLicense(licenseId);
  return res.status(204).send();
});

licenseRouter.get('/:id/audit', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }

  const logs = await auditService.getLogsByLicense(licenseId);
  return res.json({ logs });
});

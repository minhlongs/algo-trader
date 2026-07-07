import { Router, Request, Response } from 'express';
import { LicenseService } from '@platform/billing/license-service';
import { AuditLogService } from '@platform/audit/audit-log-service';
import { LicenseTier, LicenseStatus, LicenseFilters } from '@platform/types/license';
import { z } from 'zod';
import { appendTenantAuditLog } from '@platform/audit/tenant-audit-log';

export const licenseRouter: Router = Router();
const licenseService = LicenseService.getInstance();
const auditService = AuditLogService.getInstance();

const createLicenseBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tier: z.nativeEnum(LicenseTier),
  expiresAt: z.string().datetime().optional(),
  tenantId: z.string().optional(),
  domain: z.string().optional(),
});

const listLicenseQuerySchema = z.object({
  take: z.coerce.number().int().min(1).default(10),
  skip: z.coerce.number().int().min(0).default(0),
  status: z.union([z.nativeEnum(LicenseStatus), z.literal('all')]).optional(),
  tier: z.union([z.nativeEnum(LicenseTier), z.literal('all')]).optional(),
});

/**
 * GET /api/v1/licenses/analytics
 */
licenseRouter.get('/analytics', async (_req: Request, res: Response) => {
  const analytics = await licenseService.getAnalytics();
  return res.json(analytics);
});

/**
 * GET /api/v1/licenses
 */
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

/**
 * GET /api/v1/licenses/:id
 */
licenseRouter.get('/:id', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);

  if (!license) {
    return res.status(404).json({
      error: 'Not Found',
      message: `License ${licenseId} not found`,
    });
  }

  return res.json(license);
});

/**
 * POST /api/v1/licenses
 */
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

  await auditService.log(license.id, 'created', {
    tier: license.tier,
    metadata: { name },
  });

  await appendTenantAuditLog(
    license.tenantId || 'system-tenant',
    'license_created',
    'admin',
    `License created: ${name}`,
    { licenseId: license.id, tier: license.tier, name }
  );

  return res.status(201).json(license);
});

/**
 * PATCH /api/v1/licenses/:id/revoke
 */
licenseRouter.patch('/:id/revoke', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = await licenseService.revokeLicense(licenseId);

  if (!license) {
    return res.status(404).json({
      error: 'Not Found',
      message: `License ${req.params.id} not found`,
    });
  }

  await auditService.log(license.id, 'revoked', {
    tier: license.tier,
  });

  await appendTenantAuditLog(
    license.tenantId || 'system-tenant',
    'license_revoked',
    'admin',
    `License revoked: ${license.id}`,
    { licenseId: license.id, tier: license.tier }
  );

  return res.json(license);
});

/**
 * DELETE /api/v1/licenses/:id
 */
licenseRouter.delete('/:id', async (req: Request, res: Response) => {
  const licenseId = req.params.id as string;
  const license = licenseService.getLicense(licenseId);

  if (!license) {
    return res.status(404).json({
      error: 'Not Found',
      message: `License ${licenseId} not found`,
    });
  }

  await auditService.log(license.id, 'deleted', {
    tier: license.tier,
  });

  await appendTenantAuditLog(
    license.tenantId || 'system-tenant',
    'license_deleted',
    'admin',
    `License deleted: ${license.id}`,
    { licenseId: license.id, tier: license.tier }
  );

  await licenseService.deleteLicense(licenseId);

  return res.status(204).send();
});

/**
 * GET /api/v1/licenses/:id/audit
 */
licenseRouter.get('/:id/audit', async (req: Request, res: Response) => {
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

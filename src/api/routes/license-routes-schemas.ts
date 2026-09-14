import { z } from 'zod';
import { LicenseTier, LicenseStatus } from '@platform/types/license';

export const createLicenseBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tier: z.nativeEnum(LicenseTier),
  expiresAt: z.string().datetime().optional(),
  tenantId: z.string().optional(),
  domain: z.string().optional(),
});

export const listLicenseQuerySchema = z.object({
  take: z.coerce.number().int().min(1).default(10),
  skip: z.coerce.number().int().min(0).default(0),
  status: z.union([z.nativeEnum(LicenseStatus), z.literal('all')]).optional(),
  tier: z.union([z.nativeEnum(LicenseTier), z.literal('all')]).optional(),
});

import { Request } from 'express';
import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  tenantId: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursorSeq: z.coerce.number().int().optional(),
  cursorCreated: z.string().optional(),
  cursorId: z.string().uuid().optional(),
});

export const auditExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
  tenantId: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export function extractTokenClaims(req: Request): {
  tokenSubscriberId: string | null;
  isAdmin: boolean;
} {
  const claims = (req as Request & { claims?: { sub?: string; role?: string } }).claims;
  return {
    tokenSubscriberId: claims?.sub ?? null,
    isAdmin: claims?.role === 'admin',
  };
}

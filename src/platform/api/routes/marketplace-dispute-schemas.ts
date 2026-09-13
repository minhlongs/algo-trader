import type { Request } from 'express';
import { z } from 'zod';

// ==================== Validation Schemas ====================

export const fileDisputeSchema = z.object({
  listingId: z.string().min(1),
  subscriptionId: z.string().min(1),
  reason: z.enum([
    'performance_not_as_described',
    'unauthorized_charges',
    'poor_support',
    'strategy_broken',
    'other',
  ]),
  description: z.string().min(20).max(5000),
  evidenceUrls: z.array(z.string().url()).max(10).optional(),
});

export const disputeFilterSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ==================== Helper Functions ====================

interface RequestAuthContext {
  tenant?: { id?: string };
  user?: { id?: string; tenantId?: string; role?: string; tier?: string };
  apiKey?: { userId?: string; isAdmin?: boolean };
}

export function getTenantId(req: Request): string {
  const ctx = req as unknown as RequestAuthContext;
  const tenantId = ctx.tenant?.id || ctx.user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

export function getUserId(req: Request): string {
  const ctx = req as unknown as RequestAuthContext;
  const userId = ctx.user?.id || ctx.apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return String(userId);
}

export function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

export function getQueryNumber(value: unknown, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return parseInt(first, 10) || defaultValue;
    if (typeof first === 'number') return first;
    return defaultValue;
  }
  if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
  if (typeof value === 'number') return value;
  return defaultValue;
}

export function isAdmin(req: Request): boolean {
  const ctx = req as unknown as RequestAuthContext;
  return ctx.user?.role === 'admin' || ctx.apiKey?.isAdmin === true;
}

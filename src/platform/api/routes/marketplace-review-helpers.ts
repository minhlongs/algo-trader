/**
 * Marketplace Review Helpers and Validation Schemas
 */

import { Request } from 'express';
import { z } from 'zod';

export interface AuthenticatedReviewContext {
  tenant?: { id: string; tier?: string };
  user?: { id?: string; tenantId?: string; tier?: string };
  apiKey?: { userId?: string };
}

// ==================== Validation Schemas ====================

export const createReviewSchema = z.object({
  strategyId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(2000),
});

export const reviewFilterSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ==================== Helper Functions ====================

export function getTenantId(req: Request): string {
  const ctx = req as unknown as AuthenticatedReviewContext;
  const tenantId = ctx.tenant?.id || ctx.user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

export function getUserId(req: Request): string {
  const ctx = req as unknown as AuthenticatedReviewContext;
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

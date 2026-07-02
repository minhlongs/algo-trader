/**
 * Marketplace Subscription Helpers
 *
 * Shared schemas and helper functions for marketplace subscription routes.
 * Extracted to keep route files under 200 lines.
 */
import { Request } from 'express';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export const subscribeSchema = z.object({
  listingId: z.string().min(1),
  allocationPercent: z.number().int().min(1).max(100),
  customRiskLimits: z.object({
    maxDailyLossPercent: z.number().optional(),
    maxPositionSizePercent: z.number().optional(),
    stopLossPercent: z.number().optional(),
    maxConcurrentTrades: z.number().optional(),
  }).optional(),
});

export const updateSubscriptionSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
});

export const subscriptionFilterSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled', 'suspended']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const executeSchema = z.object({
  strategyId: z.string().min(1),
  marketPayload: z.record(z.string(), z.unknown()).default({}),
});

export const executeSingleSchema = z.object({
  marketPayload: z.record(z.string(), z.unknown()).default({}),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

export function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

export function getUserId(req: Request): string {
  const userId = (req as any).user?.id || (req as any).apiKey?.userId;
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
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
}

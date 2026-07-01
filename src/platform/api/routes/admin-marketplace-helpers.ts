/**
 * Admin Marketplace — Shared Helpers
 *
 * Utility functions shared across admin marketplace route modules.
 * Extracted from admin-marketplace-routes.ts to avoid duplication.
 */

import { Request } from 'express';

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

export function isAdmin(req: Request): boolean {
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
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

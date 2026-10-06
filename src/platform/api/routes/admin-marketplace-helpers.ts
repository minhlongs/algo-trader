/**
 * Admin Marketplace — Shared Helpers
 *
 * Utility functions shared across admin marketplace route modules.
 * Extracted from admin-marketplace-routes.ts to avoid duplication.
 */

import { Request } from 'express';

interface AuthenticatedRequest {
  tenant?: { id?: string };
  user?: { id?: string; tenantId?: string; role?: string };
  apiKey?: { userId?: string; isAdmin?: boolean };
}

export function getTenantId(req: Request): string {
  const r = req as unknown as AuthenticatedRequest;
  const tenantId = r.tenant?.id || r.user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

export function getUserId(req: Request): string {
  const r = req as unknown as AuthenticatedRequest;
  const userId = r.user?.id || r.apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return String(userId);
}

export function isAdmin(req: Request): boolean {
  const r = req as unknown as AuthenticatedRequest;
  return r.user?.role === 'admin' || r.apiKey?.isAdmin === true;
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

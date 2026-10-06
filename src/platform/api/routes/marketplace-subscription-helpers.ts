/**
 * Marketplace Subscription Routes — Request helpers
 *
 * Lightweight helpers for extracting and coercing request parameters.
 * All functions are pure (no side-effects) and safe to call with any input.
 */
import type { Request } from 'express';

interface AuthenticatedRequest {
  tenant?: { id?: string };
  tenantId?: string;
  user?: { id?: string; role?: string };
  userId?: string;
  apiKey?: { isAdmin?: boolean };
}

/**
 * Extract tenantId from the authenticated request.
 * Tenant context is injected by auth middleware.
 */
export function getTenantId(req: Request): string {
  const r = req as unknown as AuthenticatedRequest;
  const tenantId = r.tenant?.id ?? r.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return tenantId;
}

/**
 * Extract userId from the authenticated request.
 * User context is injected by auth middleware.
 */
export function getUserId(req: Request): string {
  const r = req as unknown as AuthenticatedRequest;
  const userId = r.user?.id ?? r.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return userId;
}

/**
 * Safely coerce an unknown value to a trimmed string.
 * Returns `defaultValue` when input is not a string or is empty.
 */
export function getQueryString(
  value: unknown,
  defaultValue: string = '',
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return defaultValue;
}

/**
 * Safely coerce an unknown value to a non-negative integer.
 * Returns `defaultValue` when coercion fails or result is negative.
 */
export function getQueryNumber(
  value: unknown,
  defaultValue: number = 0,
): number {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return defaultValue;
}

/**
 * Check if the current request is from an admin user.
 * Admin status is set by auth middleware on the request object.
 */
export function isAdmin(req: Request): boolean {
  const r = req as AuthenticatedRequest;
  return r.user?.role === 'admin' || r.apiKey?.isAdmin === true;
}

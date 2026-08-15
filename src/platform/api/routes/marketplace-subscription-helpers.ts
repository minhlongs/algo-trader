/**
 * Marketplace Subscription Routes — Request helpers
 *
 * Lightweight helpers for extracting and coercing request parameters.
 * All functions are pure (no side-effects) and safe to call with any input.
 */
import type { Request } from 'express';

/**
 * Extract tenantId from the authenticated request.
 * Tenant context is injected by auth middleware.
 */
export function getTenantId(req: Request): string {
  const tenant = (req as any).tenant as { id: string } | undefined;
  const tenantId = tenant?.id ?? (req as any).tenantId as string | undefined;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return tenantId;
}

/**
 * Extract userId from the authenticated request.
 * User context is injected by auth middleware.
 */
export function getUserId(req: Request): string {
  const user = (req as any).user as { id: string } | undefined;
  const userId = user?.id ?? (req as any).userId as string | undefined;
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
  return (
    (req as any).user?.role === 'admin' ||
    (req as any).apiKey?.isAdmin === true
  );
}

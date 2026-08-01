/**
 * TenantContext — resolve and validate tenant identity
 *
 * Single module to replace copy-pasted tenantId extraction and regex
 * checks across 12+ files. Import from here, don't reimplement.
 */

import { logger } from '../utils/logger';
import type { TenantContext, ResolveOptions, TenantId } from './types';

// ── Canonical patterns (single source of truth) ──────────────────

/** Matches the regex already used in personalization-routes.ts */
const TENANT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Max tenant ID length to prevent abuse */
const MAX_TENANT_ID_LENGTH = 128;

// ── Validation ─────────────────────────────────────────────────

export function validateTenantId(raw: unknown): raw is TenantId {
  if (typeof raw !== 'string') return false;
  if (raw.length === 0 || raw.length > MAX_TENANT_ID_LENGTH) return false;
  if (!TENANT_ID_REGEX.test(raw)) return false;
  return true;
}

// ── Resolution ────────────────────────────────────────────────

/**
 * Resolve tenant from Express request.
 *
 * Priority order:
 * 1. apiKeyAuth (set by apiKeyAuth middleware) — most trusted
 * 2. req.user?.tenantId (set by session auth / better-auth)
 * 3. x-tenant-id header (fallback, for internal service calls)
 */
export function resolveTenant(
  req: unknown,
  options: ResolveOptions = {},
): TenantContext {
  const headerName = options.headerName ?? 'x-tenant-id';

  // 1. API key auth (highest trust — key was verified against DB)
  const apiKeyAuth = (req as Record<string, unknown>).apiKeyAuth as
    | { tenantId: string; keyId: string; label: string }
    | undefined;
  if (apiKeyAuth?.tenantId && validateTenantId(apiKeyAuth.tenantId)) {
    return {
      tenantId: apiKeyAuth.tenantId as TenantId,
      source: 'api-key',
      keyLabel: apiKeyAuth.label,
    };
  }

  // 2. User session auth
  const user = (req as Record<string, unknown>).user as
    | { tenantId?: string }
    | undefined;
  if (user?.tenantId && validateTenantId(user.tenantId)) {
    return {
      tenantId: user.tenantId as TenantId,
      source: 'user-session',
      role: (user as Record<string, unknown>).role as string | undefined,
    };
  }

  // 2b. Express claims shape (tests + Express auth middleware)
  // req.claims = { sub: <tenantId>, role?: string }
  const claims = (req as Record<string, unknown>).claims as
    | { sub?: string; role?: string }
    | undefined
  if (claims?.sub && validateTenantId(claims.sub)) {
    return {
      tenantId: claims.sub as TenantId,
      source: 'user-session',
      role: claims.role,
    };
  }

  // 3. Header fallback (lowest trust — for internal service-to-service calls)
  const headerValue = (req as Record<string, unknown>)[headerName] as string | undefined;
  if (headerValue && validateTenantId(headerValue)) {
    return {
      tenantId: headerValue as TenantId,
      source: 'header',
    };
  }

  return { tenantId: null, source: 'none' };
}

// ── Resource Key Scoping ───────────────────────────────────────

/**
 * Generate a scoped resource key for storage paths.
 *
 * Prevents path traversal and cross-tenant access by binding a resource
 * name to a validated tenant ID.
 *
 * @example
 * tenantResourceKey('tenant-abc', 'events') → 'tenant-abc:events'
 * tenantResourceKey('tenant-abc', 'config') → 'tenant-abc:config'
 */
export function tenantResourceKey(
  tenantId: TenantId,
  resource: string,
): string {
  return `${tenantId}:${resource}`;
}

/**
 * Validate that a given resource key belongs to the given tenant.
 * Returns false if the key is malformed or belongs to a different tenant.
 */
export function validateResourceKey(
  key: string,
  expectedTenantId: TenantId,
): boolean {
  const prefix = `${expectedTenantId}:`;
  if (!key.startsWith(prefix)) return false;
  return validateTenantId(key.slice(0, key.indexOf(':')));
}

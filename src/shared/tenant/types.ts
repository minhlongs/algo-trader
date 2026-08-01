/**
 * TenantContext — shared tenant identity types
 *
 * Single source of truth for tenant resolution across the platform.
 * Replaces copy-pasted tenantId extraction and TENANT_ID_REGEX checks.
 */

/** Canonical tenant ID: lowercase alphanumeric, hyphens, underscores only */
export type TenantId = string & { readonly __brand: 'TenantId' };

/** Context object returned by resolveTenant — rich auth info when available */
export interface TenantContext {
  /** Validated tenant ID, or null if unauthenticated/invalid */
  tenantId: TenantId | null;

  /** Source that resolved the tenant */
  source: 'api-key' | 'user-session' | 'header' | 'none';

  /** API key label (when source is 'api-key') */
  keyLabel?: string;

  /** User role (when source is 'user-session') */
  role?: string;
}

/** Options for resolveTenant */
export interface ResolveOptions {
  /** Header name to fallback-check (default: 'x-tenant-id') */
  headerName?: string;

  /** Allow anonymous (unauthenticated) requests */
  allowAnonymous?: boolean;
}

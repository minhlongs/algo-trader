/**
 * Platform Tenant-Isolation Filter
 *
 * THE canonical tenant filter for all platform DB queries.
 * Every platform query on multi-tenant data MUST use buildTenantFilter().
 *
 * Delegates to the subscriber-tenant-isolator implementation.
 * When raas/ moves to platform/raas/, this becomes a direct re-export.
 */

export {
  buildTenantFilter,
  tenantQuery,
  assertTenantAccess,
} from '../raas/subscriber-tenant-isolator';

export type { TenantFilter, TenantQueryResult } from '../raas/subscriber-tenant-isolator';

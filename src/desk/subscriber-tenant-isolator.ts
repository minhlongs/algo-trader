// SPDX-License-Identifier: MIT
/**
 * Step 16: Multi-Tenant RBAC Isolation Facade
 * Wraps src/raas/subscriber-tenant-isolator.ts to provide cryptographic tenant
 * context partitioning and RBAC query isolation for the desk execution plane.
 *
 * @module desk/subscriber-tenant-isolator
 */

import {
  assertTenantAccess,
  buildTenantFilter,
  tenantQuery,
  type TenantFilter,
  type TenantQueryResult,
} from '../raas/subscriber-tenant-isolator';

export {
  assertTenantAccess,
  buildTenantFilter,
  tenantQuery,
  type TenantFilter,
  type TenantQueryResult,
};

export class SubscriberTenantIsolator {
  public createFilter(subscriberId: string, startIndex = 1): TenantFilter {
    return buildTenantFilter(subscriberId, startIndex);
  }

  public verifyAccess(
    requestSubscriberId: string,
    tokenSubscriberId: string | null | undefined,
    isAdmin = false
  ): void {
    assertTenantAccess(requestSubscriberId, tokenSubscriberId, isAdmin);
  }
}

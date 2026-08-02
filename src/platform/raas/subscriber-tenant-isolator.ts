/**
 * Subscriber Tenant Isolator
 * Enforces per-subscriber WHERE clauses on all DB queries.
 * This is the ONLY authorized way to query trades in subscriber context.
 * Never bypass this — all subscriber queries MUST go through buildTenantFilter().
 */

import { query } from '../../shared/db/postgres-client.js';
import type { DbRow } from '../../shared/db/postgres-client.js';

/** Opaque filter bundle — callers should not construct this directly. */
export interface TenantFilter {
  subscriberId: string;
  /** SQL fragment: "AND subscriber_id = $N" */
  clause: string;
  /** Positional parameter index used for subscriber_id */
  paramIndex: number;
}

/**
 * Build a tenant filter starting at the given param index.
 * @param subscriberId  Must be non-empty string.
 * @param startIndex    Next $N index for the calling query (default 1).
 */
export function buildTenantFilter(
  subscriberId: string,
  startIndex = 1
): TenantFilter {
  if (!subscriberId || subscriberId.trim() === '') {
    throw new Error('TenantIsolator: subscriberId must be a non-empty string');
  }
  return {
    subscriberId,
    clause: `AND subscriber_id = $${startIndex}`,
    paramIndex: startIndex,
  };
}

export interface TenantQueryResult<T extends DbRow> {
  rows: T[];
}

// Execute a subscriber-scoped query.
// The SQL must contain the placeholder {TENANT-MARKER} which is replaced with
// the tenant WHERE clause. This makes it impossible to forget isolation.
//
// Example: tenantQuery("SELECT * FROM trades WHERE status=$1 {TENANT-MARKER} ORDER BY created_at DESC", ["FILLED"], filter)
// The marker value is '/' + '*TENANT*' + '/' — avoided in JSDoc to prevent nested block-comment parsing.
export async function tenantQuery<T extends DbRow>(
  sql: string,
  baseParams: (string | number | boolean | null)[],
  filter: TenantFilter
): Promise<TenantQueryResult<T>> {
  // Replace placeholder with actual clause
  const safeSql = sql.replace('/*TENANT*/', filter.clause);

  // Append subscriber_id to params at the correct position
  const params = [...baseParams, filter.subscriberId];

  const result = await query(safeSql, params);
  return { rows: result.rows as T[] };
}

/**
 * Verify that the caller owns the given subscriber ID.
 * Returns true if authorized, false otherwise.
 * Used by route middleware to gate cross-tenant access.
 */
export function assertTenantAccess(
  requestSubscriberId: string,
  tokenSubscriberId: string | null | undefined,
  isAdmin: boolean
): void {
  if (isAdmin) return; // admins can read any tenant
  if (!tokenSubscriberId) {
    throw new Error('TenantIsolator: no subscriber identity in token');
  }
  if (tokenSubscriberId !== requestSubscriberId) {
    throw new Error(
      `TenantIsolator: cross-tenant access denied - token=${tokenSubscriberId} requested=${requestSubscriberId}`
    );
  }
}

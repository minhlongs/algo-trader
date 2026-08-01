/**
 * Re-export from the production audit module.
 *
 * This module previously contained a no-op stub that silently dropped all
 * audit entries. Callers importing from this path (`../audit/tenant-audit-log`)
 * — including the arbitrage trading loop and order executor — were writing
 * nothing to the database.
 *
 * All consumers should now resolve to the real chain-hash implementation
 * in `src/platform/audit/tenant-audit-log.ts`.
 */
export {
  type TenantAuditLog,
  type AuditLogEntry,
  canonicalJsonStringify,
  computeTenantAuditHash,
  appendTenantAuditLog,
  verifyTenantChain,
} from '../../platform/audit/tenant-audit-log';

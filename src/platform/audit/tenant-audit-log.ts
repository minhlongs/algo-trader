/**
 * Tenant Audit Log — Hash-Chained Immutable Audit Trail (Facade)
 *
 * @deprecated Since Phase 35 security hardening (2026-08-11).
 * Canonical audit table is now `audit_log` (migration 040 + 041 hash-chain).
 * All new code MUST use `audit_log` via `src/seed/security/audit-log.ts` or
 * `src/seed/security/audit-middleware.ts`.
 *
 * This module is retained for read-only verification of historical chains.
 * No new writes should call `appendTenantAuditLog`.
 */

export type {
  TenantAuditLog,
  TenantChainVerificationResult,
  TenantAuditHashInput,
} from './tenant-audit-types';

export {
  canonicalJsonStringify,
  computeTenantAuditHash,
} from './tenant-audit-hash';

export { appendTenantAuditLog } from './tenant-audit-writer';
export { verifyTenantChain } from './tenant-audit-verifier';

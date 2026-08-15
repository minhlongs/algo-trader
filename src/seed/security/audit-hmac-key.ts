/**
 * @module security/audit-hmac-key
 *
 * HMAC key lifecycle for the audit hash chain.
 *
 * Reads `AUDIT_HMAC_KEY_v1` from env (64 hex chars = 32 bytes).
 * Fail-fast on missing/invalid key — audit integrity unavailable without it.
 */

import { logger } from '../../shared/utils/logger';

// ─── State ────────────────────────────────────────────────────────────────────

/** Cached HMAC key — populated once on first access. */
let auditHmacKey: Buffer | null = null;

/** Key version counter (incremented on rotation; starts at 1). */
let auditHmacKeyVersion = 1;

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Initialize HMAC key from env — fail-fast if missing or malformed.
 * Returns cached key on subsequent calls.
 */
export function initHmacKey(): Buffer {
  if (auditHmacKey) return auditHmacKey;

  const envKey = process.env.AUDIT_HMAC_KEY_v1;
  if (!envKey) {
    const err = new Error('AUDIT_HMAC_KEY_v1 not configured — audit logging unavailable');
    logger.error('[AuditLog] Startup failure', { cause: err.message });
    throw err;
  }

  if (!/^[0-9a-f]{64}$/i.test(envKey)) {
    const err = new Error('AUDIT_HMAC_KEY_v1 must be 64 hex characters (32 bytes)');
    logger.error('[AuditLog] Invalid key format', { cause: err.message });
    throw err;
  }

  auditHmacKey = Buffer.from(envKey, 'hex');
  logger.info('[AuditLog] HMAC key initialized', { version: auditHmacKeyVersion });
  return auditHmacKey;
}

/**
 * Get current HMAC key version (for readiness/health checks).
 * Does not expose the key itself.
 */
export function getAuditHmacKeyVersion(): number {
  initHmacKey(); // validates presence
  return auditHmacKeyVersion;
}

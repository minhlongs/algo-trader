/**
 * Audit-log types — single source of truth for the audit-log module.
 */

/** Severity / outcome of the audited action. */
export type AuditResult = 'success' | 'failure' | 'denied';

/** A single record in the audit trail. */
export interface IAuditEntry {
  /** Primary key — ULID format preferred, 26-char. */
  id: string;
  /** ISO-8601 UTC timestamp of when the action occurred. */
  timestamp: string;
  /** Who triggered the action — user ID, service account, or `system`. */
  actor: string;
  /** Action verb, e.g. `api_keys.create`, `strategy.start`. */
  action: string;
  /** Resource that was acted upon, e.g. `Strategy:42`, `Orderbook`. */
  resource: string;
  /** Outcome — success, failure, or denied. */
  result: AuditResult;
  /** Max 4 kB arbitrary JSON (status codes, strategy IDs, etc.). */
  metadata: Record<string, unknown>;
  /** SHA-256 of the actor's IP address (or `'redacted'`). */
  ipHash: string;
  /** Tenant scope — null for system-level events. */
  tenantId?: string;
}

/** Encrypted payload stored in DB (base64-encoded fields). */
export interface EncryptedPayload {
 ciphertext: string; // base64
 iv: string;         // base64
 tag: string;        // base64
}

/** Envelope key info for key-rotation tracking. */
export interface EnvelopeKey {
 encryptedDataKey: string; // base64
 keyVersion: number;
 algorithm: 'aes-256-gcm';
}

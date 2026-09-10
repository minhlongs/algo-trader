import * as crypto from 'crypto';

export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH = 12; // 96-bit per NIST SP 800-38D
export const TAG_LENGTH = 16;
export const KEY_LENGTH = 32;
export const VERSION_PREFIX = 'v1:';

/**
 * Derive a per-tenant, per-field Data Encryption Key (DEK) from master key.
 * Uses HKDF-SHA256 with context binding to prevent cross-tenant/field decryption.
 */
export function deriveDek(masterKey: Buffer, tenantId: string, field: string): Buffer {
  const context = Buffer.from(`tenant:${tenantId}:field:${field}`, 'utf8');
  const result = crypto.hkdfSync('sha256', masterKey, Buffer.from(''), context, KEY_LENGTH);
  return Buffer.from(result);
}

/**
 * Get current master key from environment.
 * Throws descriptive error if not configured (fail-fast).
 */
export function getCurrentMasterKey(): Buffer {
  const envKey = process.env.CREDENTIALS_ENCRYPTION_KEY ?? process.env.ENCRYPTION_MASTER_KEY;
  if (!envKey) {
    throw new Error('ENCRYPTION_MASTER_KEY not configured');
  }
  const key = Buffer.from(envKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
  }
  return key;
}

/**
 * Get previous master key for rotation support.
 * Returns null if not configured (graceful degradation).
 */
export function getPreviousMasterKey(): Buffer | null {
  const envKey = process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS ?? process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
  if (!envKey) {
    return null;
  }
  const key = Buffer.from(envKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_MASTER_KEY_PREVIOUS must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
  }
  return key;
}

/**
 * Validate encryption configuration at startup.
 * Throws if current master key is missing or malformed.
 * Does not expose secrets in error messages.
 */
export function validateEncryptionConfig(): { currentKeyVersion: number; hasPreviousKey: boolean } {
  let currentKeyVersion = 1;
  try {
    getCurrentMasterKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Encryption config invalid: ${msg}`);
  }

  const hasPreviousKey = getPreviousMasterKey() !== null;
  if (hasPreviousKey) {
    currentKeyVersion = 2; // indicates rotation in progress
  }

  return { currentKeyVersion, hasPreviousKey };
}

/**
 * Get key version info for readiness endpoint.
 * Returns only version metadata, never secrets.
 */
export function getKeyVersionInfo(): { current: number; previous: number | null } {
  const currentVersion = 1;
  const prevKey = getPreviousMasterKey();
  return {
    current: currentVersion,
    previous: prevKey ? 2 : null,
  };
}

/**
 * Generate a new 256-bit master key (for key rotation).
 * Returns hex-encoded key suitable for ENCRYPTION_MASTER_KEY env var.
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Alias for generateMasterKey — returns 32-byte hex string.
 * Used by tests and external callers expecting generateKey name.
 */
export const generateKey = generateMasterKey;

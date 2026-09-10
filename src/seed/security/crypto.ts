import {
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH,
  VERSION_PREFIX,
  deriveDek,
  getCurrentMasterKey,
  getPreviousMasterKey,
  validateEncryptionConfig,
  getKeyVersionInfo,
  generateMasterKey,
  generateKey,
} from './crypto-keys';
import { hashPassword, verifyPassword } from './crypto-password';
import { encrypt, decrypt, encryptWithKey, decryptWithKey } from './crypto-cipher';

export {
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH,
  VERSION_PREFIX,
  deriveDek,
  getCurrentMasterKey,
  getPreviousMasterKey,
  validateEncryptionConfig,
  getKeyVersionInfo,
  generateMasterKey,
  generateKey,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  encryptWithKey,
  decryptWithKey,
};

/**
 * Encrypt a string with tenant-scoped DEK derivation.
 * Returns version-prefixed payload for key rotation support.
 *
 * @param plaintext - String to encrypt
 * @param tenantId - Tenant identifier for DEK derivation
 * @param field - Field identifier for DEK derivation (e.g., 'apiKey', 'apiSecret')
 * @returns Version-prefixed encrypted string (v1:ciphertext:iv:tag)
 * @throws Error if master key not configured or encryption fails
 */
export function encryptForTenant(plaintext: string, tenantId: string, field: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('plaintext must be a string');
  }
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new TypeError('tenantId must be a non-empty string');
  }
  if (typeof field !== 'string' || !field) {
    throw new TypeError('field must be a non-empty string');
  }

  const masterKey = getCurrentMasterKey();
  const dek = deriveDek(masterKey, tenantId, field);
  const encrypted = encrypt(plaintext, dek);
  return `${VERSION_PREFIX}${encrypted.ciphertext}:${encrypted.iv}:${encrypted.tag}`;
}

/**
 * Decrypt a version-prefixed string with tenant-scoped DEK derivation.
 * Supports dual-key read (current + previous) for key rotation.
 * Throws generic error on any decryption failure (fail-closed).
 *
 * @param packed - Version-prefixed encrypted string (v1:ciphertext:iv:tag)
 * @param tenantId - Tenant identifier for DEK derivation
 * @param field - Field identifier for DEK derivation
 * @returns Decrypted plaintext string
 * @throws TypeError on invalid inputs
 * @throws Error('decryption failed') on any crypto/auth failure
 */
export function decryptForTenant(packed: string, tenantId: string, field: string): string {
  if (typeof packed !== 'string') {
    throw new TypeError('packed must be a string');
  }
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new TypeError('tenantId must be a non-empty string');
  }
  if (typeof field !== 'string' || !field) {
    throw new TypeError('field must be a non-empty string');
  }

  // Parse version prefix
  if (!packed.startsWith(VERSION_PREFIX)) {
    throw new Error('decryption failed');
  }

  const payload = packed.slice(VERSION_PREFIX.length);
  const [ciphertext, iv, tag] = payload.split(':');
  if (!ciphertext || !iv || !tag) {
    throw new Error('decryption failed');
  }

  // Try current master key first
  let dek: Buffer;
  try {
    const masterKey = getCurrentMasterKey();
    dek = deriveDek(masterKey, tenantId, field);
    return decrypt(ciphertext, iv, tag, dek);
  } catch {
    // Fall back to previous master key if available
    const prevMasterKey = getPreviousMasterKey();
    if (!prevMasterKey) {
      throw new Error('decryption failed');
    }
    try {
      dek = deriveDek(prevMasterKey, tenantId, field);
      return decrypt(ciphertext, iv, tag, dek);
    } catch {
      throw new Error('decryption failed');
    }
  }
}

/**
 * Encrypt a plaintext string using the legacy envKey() for backward compatibility.
 * @deprecated Use encryptForTenant for new code with tenant scoping.
 */
function envKey(): Buffer {
  return getCurrentMasterKey();
}

/** Pack {ciphertext, iv, tag} into colon-delimited string for DB storage (legacy). */
export function encryptString(plaintext: string): string {
  const key = envKey();
  const p = encrypt(plaintext, key);
  return [p.ciphertext, p.iv, p.tag].join(':');
}

/** Unpack colon-delimited string -> decrypt -> return plaintext (legacy). */
export function decryptString(packed: string): string {
  const [ct, iv, tag] = packed.split(':');
  const key = envKey();
  return decrypt(ct, iv, tag, key);
}

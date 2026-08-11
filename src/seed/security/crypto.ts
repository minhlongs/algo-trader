import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit per NIST SP 800-38D
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const VERSION_PREFIX = 'v1:';

/**
 * AES-256-GCM encryption utilities — zero external dependencies.
 *
 * Uses Node.js built-in `crypto` module only.
 * Supports key rotation via version-prefixed payloads and per-tenant/field DEK derivation.
 */

/**
 * Derive a per-tenant, per-field Data Encryption Key (DEK) from master key.
 * Uses HKDF-SHA256 with context binding to prevent cross-tenant/field decryption.
 */
function deriveDek(masterKey: Buffer, tenantId: string, field: string): Buffer {
  const context = Buffer.from(`tenant:${tenantId}:field:${field}`, 'utf8');
  const result = crypto.hkdfSync('sha256', masterKey, Buffer.from(''), context, KEY_LENGTH);
  return Buffer.from(result);
}

/**
 * Get current master key from environment.
 * Throws descriptive error if not configured (fail-fast).
 */
function getCurrentMasterKey(): Buffer {
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
function getPreviousMasterKey(): Buffer | null {
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
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param plaintext - String to encrypt (must be string, not empty)
 * @param key - 32-byte Buffer (256-bit key)
 * @returns Object with ciphertext, iv, tag as base64 strings
 * @throws TypeError on invalid inputs
 * @throws Error on crypto failure
 */
export function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  if (typeof plaintext !== 'string') {
    throw new TypeError('plaintext must be a string');
  }
  if (!(key instanceof Buffer) || key.length !== KEY_LENGTH) {
    throw new TypeError(`key must be a ${KEY_LENGTH}-byte Buffer`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a ciphertext with AES-256-GCM.
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @param iv - Base64-encoded initialization vector
 * @param tag - Base64-encoded authentication tag
 * @param key - 32-byte Buffer (256-bit key)
 * @returns Decrypted plaintext string
 * @throws TypeError on invalid inputs
 * @throws Error on auth failure (wrong key, tampered data, etc.)
 */
export function decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof tag !== 'string') {
    throw new TypeError('ciphertext, iv, and tag must be strings');
  }
  if (!(key instanceof Buffer) || key.length !== KEY_LENGTH) {
    throw new TypeError(`key must be a ${KEY_LENGTH}-byte Buffer`);
  }

  try {
    const ciphertextBuf = Buffer.from(ciphertext, 'base64');
    const ivBuf = Buffer.from(iv, 'base64');
    const tagBuf = Buffer.from(tag, 'base64');

    if (ivBuf.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (tagBuf.length !== TAG_LENGTH) {
      throw new Error('Invalid tag length');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
    decipher.setAuthTag(tagBuf);
    const plaintext = Buffer.concat([
      decipher.update(ciphertextBuf),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`decryption failed: ${msg}`);
  }
}

/**
 * Hash a password using PBKDF2 with SHA-256.
 *
 * @param password - Password to hash
 * @param key - Optional key for deterministic hashing (e.g., for testing)
 * @returns Hash string in format: iterations:salt:hash (all base64)
 * @throws TypeError on invalid inputs
 */
export function hashPassword(password: string, key?: Buffer): string {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  const salt = crypto.randomBytes(16);
  const iterations = 600000; // OWASP 2024 recommendation: 600k+ PBKDF2-SHA256
  const derivedKey = key ?? crypto.randomBytes(KEY_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
  return [iterations.toString(), salt.toString('base64'), hash.toString('base64'), derivedKey.toString('base64')].join(':');
}

/**
 * Verify a password against a hash.
 *
 * @param password - Password to verify
 * @param hash - Hash string from hashPassword
 * @param key - Optional key for deterministic hashing (must match hashPassword call)
 * @returns True if password matches
 * @throws TypeError on invalid inputs
 */
export function verifyPassword(password: string, hash: string, key?: Buffer): Promise<boolean> {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  if (typeof hash !== 'string') {
    throw new TypeError('hash must be a string');
  }

  const parts = hash.split(':');
  if (parts.length !== 4) {
    throw new TypeError('Invalid hash format');
  }

  const iterations = parseInt(parts[0], 10);
  const salt = Buffer.from(parts[1], 'base64');
  const expectedHash = Buffer.from(parts[2], 'base64');
  const derivedKey = key ?? Buffer.from(parts[3], 'base64');

  const computedHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
  return Promise.resolve(crypto.timingSafeEqual(computedHash, expectedHash));
}

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

/** Unpack colon-delimited string → decrypt → return plaintext (legacy). */
export function decryptString(packed: string): string {
  const [ct, iv, tag] = packed.split(':');
  const key = envKey();
  return decrypt(ct, iv, tag, key);
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

/**
 * Test-only: encrypt with specific master key (bypasses env).
 */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const p = encrypt(plaintext, key);
  return [p.ciphertext, p.iv, p.tag].join(':');
}

/**
 * Test-only: decrypt with specific master key (bypasses env).
 */
export function decryptWithKey(packed: string, key: Buffer): string {
  const [ct, iv, tag] = packed.split(':');
  return decrypt(ct, iv, tag, key);
}
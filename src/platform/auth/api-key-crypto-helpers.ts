/**
 * API Key Crypto & Row Mapping Helpers
 * Pure scrypt hashing, timing-safe key verification, and DB row mappers.
 */
import { scrypt, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const KEY_LENGTH_BYTES = 32;
export const KEY_PREFIX_LENGTH = 8;
export const SALT_LENGTH = 16;
export const HASH_LENGTH = 64;

export interface GeneratedKeyMaterial {
  id: string;
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
  fullKey: string;
}

/**
 * Hash a plaintext API key using scrypt with a random 16-byte hex salt.
 */
export async function hashKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = (await scryptAsync(key, salt, HASH_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Generate raw API key material and scrypt hash prior to persistence.
 */
export async function createRawApiKeyMaterial(): Promise<GeneratedKeyMaterial> {
  const rawBytes = randomBytes(KEY_LENGTH_BYTES);
  const rawKey = rawBytes.toString('base64url');
  const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
  const keyHash = await hashKey(rawKey);
  const id = randomUUID();
  return {
    id,
    rawKey,
    keyPrefix,
    keyHash,
    fullKey: `${keyPrefix}.${rawKey}`,
  };
}

/**
 * Verify a plaintext key against a stored scrypt hash (salt:hex format).
 */
export async function verifyApiKey(key: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const derivedKey = (await scryptAsync(key, salt, HASH_LENGTH)) as Buffer;
    const storedBuffer = Buffer.from(hash, 'hex');
    if (derivedKey.length !== storedBuffer.length) return false;
    return timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

export function mapApiKeyListRow(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    label: r.label as string,
    keyPrefix: r.key_prefix as string,
    lastUsedAt: r.last_used_at as Date | null,
    createdAt: r.created_at as Date,
    revokedAt: r.revoked_at as Date | null,
    expiresAt: r.expires_at as Date | null,
  };
}

export function mapActiveKeyPrefixRow(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    label: r.label as string,
    keyHash: r.key_hash as string,
    revokedAt: r.revoked_at as Date | null,
    expiresAt: r.expires_at as Date | null,
  };
}

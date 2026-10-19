/**
 * API Key Helpers
 * Generates, hashes, stores, lists, and revokes developer API keys.
 * Uses scrypt for key hashing (N=16384, r=8, p=1 defaults).
 */
import { getDbClient } from '../../shared/db/postgres-client';
import {
  createRawApiKeyMaterial,
  hashKey,
  verifyApiKey,
  mapApiKeyListRow,
  mapActiveKeyPrefixRow,
} from './api-key-crypto-helpers';

export {
  createRawApiKeyMaterial,
  hashKey,
  verifyApiKey,
  mapApiKeyListRow,
  mapActiveKeyPrefixRow,
};

/**
 * Generate a new API key, hash it with scrypt, and persist to the database.
 * Returns the full plaintext key (show-once) and metadata.
 */
export async function generateApiKey(
  tenantId: string,
  label: string,
  expiresAt?: Date,
): Promise<{
  fullKey: string;
  keyPrefix: string;
  keyHash: string;
  id: string;
  tenantId: string;
  label: string;
  createdAt: Date;
}> {
  const { id, keyPrefix, keyHash, fullKey } = await createRawApiKeyMaterial();

  const db = getDbClient();
  await db.query(
    `INSERT INTO api_keys (id, tenant_id, label, key_prefix, key_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, label, keyPrefix, keyHash, expiresAt ?? null],
  );

  return {
    fullKey,
    keyPrefix,
    keyHash,
    id,
    tenantId,
    label,
    createdAt: new Date(),
  };
}

/**
 * List active API keys for a tenant (masked — prefix only, no full hash).
 */
export async function listApiKeys(tenantId: string): Promise<Array<{
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
}>> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, label, key_prefix, last_used_at, created_at, revoked_at, expires_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows.map((r: Record<string, unknown>) => mapApiKeyListRow(r));
}

/**
 * Revoke an API key by ID.
 * Returns true if found and revoked, false if not found or already revoked.
 */
export async function revokeApiKey(keyId: string, tenantId: string): Promise<boolean> {
  const db = getDbClient();
  const result = await db.query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [keyId, tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Find a non-revoked, non-expired API key by its 8-char prefix.
 * Returns matching rows with full hash data for verification.
 */
export async function findActiveKeysByPrefix(prefix: string): Promise<Array<{
  id: string;
  tenantId: string;
  label: string;
  keyHash: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}>> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, tenant_id, label, key_hash, revoked_at, expires_at
     FROM api_keys
     WHERE key_prefix = $1 AND revoked_at IS NULL
     LIMIT 10`,
    [prefix],
  );
  return result.rows.map((r: Record<string, unknown>) => mapActiveKeyPrefixRow(r));
}

/**
 * Get a single API key by ID (for ownership verification).
 */
export async function getApiKeyById(keyId: string): Promise<{
  id: string; tenantId: string; label: string; createdAt: Date;
} | null> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, tenant_id, label, created_at FROM api_keys WHERE id = $1`,
    [keyId],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    label: r.label as string,
    createdAt: r.created_at as Date,
  };
}

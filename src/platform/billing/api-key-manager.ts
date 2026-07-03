/**
 * API Key Manager — Phase 17
 * Security: key shown once, SHA-256 hash stored, max 3 active per license.
 * Storage: PostgreSQL via postgres-client
 */

import * as crypto from 'crypto';
import { query } from '../../shared/db/postgres-client';
import { LicenseTier } from '../../shared/types/license';

export interface ApiKey {
  id: string;
  keyHash: string;    // SHA-256 of full key — never store plaintext
  keyPrefix: string;  // first 8 chars for display
  licenseId: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  isActive: boolean;
}

export interface GeneratedApiKey {
  key: string;    // Full key — shown ONCE, never persisted
  apiKey: ApiKey; // Stored record (hashed)
}

interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_prefix: string;
  license_id: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  is_active: boolean;
}

const MAX_ACTIVE_KEYS = 3;

/** Tier abbreviations for key prefix */
const TIER_ABBREV: Record<LicenseTier, string> = {
  [LicenseTier.FREE]: 'free',
  [LicenseTier.PRO]: 'pro',
  [LicenseTier.ENTERPRISE]: 'ent',
  [LicenseTier.MASTER]: 'mst',
};

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    licenseId: row.license_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    isActive: row.is_active,
  };
}

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateRandomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export class ApiKeyManager {
  private static instance: ApiKeyManager;

  private constructor() {}

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  /** Generate a new API key. Returns full key (shown once). Throws if at MAX_ACTIVE_KEYS. */
  async generateApiKey(licenseId: string, tier: LicenseTier): Promise<GeneratedApiKey> {
    const activeResult = await query(
      'SELECT COUNT(*) as count FROM api_keys WHERE license_id = $1 AND is_active = true',
      [licenseId]
    );
    const activeCount = parseInt(activeResult.rows[0].count as string, 10);
    if (activeCount >= MAX_ACTIVE_KEYS) {
      throw new Error(`Max ${MAX_ACTIVE_KEYS} active keys per license. Rotate or revoke an existing key.`);
    }

    const tierAbbrev = TIER_ABBREV[tier] ?? 'key';
    const random = generateRandomHex(16); // 32 hex chars
    const rawKey = `at_${tierAbbrev}_${random}`;
    const keyPrefix = rawKey.slice(0, 8);

    const apiKey: ApiKey = {
      id: `ak_${generateRandomHex(8)}`,
      keyHash: hashKey(rawKey),
      keyPrefix,
      licenseId,
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
      isActive: true,
    };

    await query(
      `INSERT INTO api_keys (id, key_hash, key_prefix, license_id, created_at, last_used_at, revoked_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        apiKey.id,
        apiKey.keyHash,
        apiKey.keyPrefix,
        apiKey.licenseId,
        apiKey.createdAt,
        apiKey.lastUsedAt,
        apiKey.revokedAt,
        apiKey.isActive,
      ]
    );

    return { key: rawKey, apiKey };
  }

  /** Revoke all active keys for a license, then issue one new key. */
  async rotateApiKey(licenseId: string, tier: LicenseTier): Promise<GeneratedApiKey> {
    // Revoke all existing active keys
    await query(
      'UPDATE api_keys SET is_active = false, revoked_at = $1 WHERE license_id = $2 AND is_active = true',
      [Date.now(), licenseId]
    );

    // Generate fresh key bypassing active-key count check (we just cleared them)
    const tierAbbrev = TIER_ABBREV[tier] ?? 'key';
    const random = generateRandomHex(16);
    const rawKey = `at_${tierAbbrev}_${random}`;
    const keyPrefix = rawKey.slice(0, 8);

    const apiKey: ApiKey = {
      id: `ak_${generateRandomHex(8)}`,
      keyHash: hashKey(rawKey),
      keyPrefix,
      licenseId,
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
      isActive: true,
    };

    await query(
      `INSERT INTO api_keys (id, key_hash, key_prefix, license_id, created_at, last_used_at, revoked_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        apiKey.id,
        apiKey.keyHash,
        apiKey.keyPrefix,
        apiKey.licenseId,
        apiKey.createdAt,
        apiKey.lastUsedAt,
        apiKey.revokedAt,
        apiKey.isActive,
      ]
    );

    return { key: rawKey, apiKey };
  }

  /** Revoke a specific key by ID. Returns updated record or undefined. */
  async revokeApiKey(keyId: string): Promise<ApiKey | undefined> {
    const result = await query(
      'UPDATE api_keys SET is_active = false, revoked_at = $1 WHERE id = $2 RETURNING *',
      [Date.now(), keyId]
    );

    if (result.rows.length === 0) return undefined;
    return rowToApiKey(result.rows[0] as unknown as ApiKeyRow);
  }

  /** Validate raw key by hash. Updates lastUsedAt on success. */
  async validateApiKey(rawKey: string): Promise<{ valid: boolean; apiKey?: ApiKey }> {
    const hash = hashKey(rawKey);
    const result = await query(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
      [hash]
    );

    if (result.rows.length === 0) return { valid: false };

    const key = rowToApiKey(result.rows[0] as unknown as ApiKeyRow);
    // Update lastUsedAt
    await query(
      'UPDATE api_keys SET last_used_at = $1 WHERE id = $2',
      [Date.now(), key.id]
    );
    key.lastUsedAt = Date.now();

    return { valid: true, apiKey: key };
  }

  /** List all keys for a license — prefix + status only, no full key or hash returned. */
  async listApiKeys(licenseId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const result = await query(
      'SELECT * FROM api_keys WHERE license_id = $1 ORDER BY created_at DESC',
      [licenseId]
    );

    return result.rows.map((row) => {
      const key = rowToApiKey(row as unknown as ApiKeyRow);
      const { keyHash: _hash, ...safe } = key;
      return safe;
    });
  }

  private async getActiveKeysForLicense(licenseId: string): Promise<ApiKey[]> {
    const result = await query(
      'SELECT * FROM api_keys WHERE license_id = $1 AND is_active = true',
      [licenseId]
    );
    return result.rows.map((r) => rowToApiKey(r as unknown as ApiKeyRow));
  }
}

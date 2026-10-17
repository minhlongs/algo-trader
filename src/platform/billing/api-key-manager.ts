/**
 * API Key Manager — Phase 17
 * Security: key shown once, SHA-256 hash stored, max 3 active per license.
 * Storage: data/api-keys.json (mirrors license-service pattern)
 */

import { LicenseTier } from '../../shared/types/license';
import {
  type ApiKey,
  type GeneratedApiKey,
  MAX_ACTIVE_KEYS,
  TIER_ABBREV,
  saveToFile,
  loadFromFile,
  hashKey,
  generateRandomHex,
} from './api-key-helpers';

export type { ApiKey, GeneratedApiKey };

export class ApiKeyManager {
  private static instance: ApiKeyManager;
  private keys: Map<string, ApiKey>;

  private constructor() {
    this.keys = loadFromFile();
  }

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  /** Generate a new API key. Returns full key (shown once). Throws if at MAX_ACTIVE_KEYS. */
  generateApiKey(licenseId: string, tier: LicenseTier): GeneratedApiKey {
    const activeKeys = this.getActiveKeysForLicense(licenseId);
    if (activeKeys.length >= MAX_ACTIVE_KEYS) {
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

    this.keys.set(apiKey.id, apiKey);
    saveToFile(this.keys);

    return { key: rawKey, apiKey };
  }

  /** Revoke all active keys for a license, then issue one new key. */
  rotateApiKey(licenseId: string, tier: LicenseTier): GeneratedApiKey {
    // Revoke all existing active keys
    for (const key of this.keys.values()) {
      if (key.licenseId === licenseId && key.isActive) {
        key.isActive = false;
        key.revokedAt = Date.now();
        this.keys.set(key.id, key);
      }
    }

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

    this.keys.set(apiKey.id, apiKey);
    saveToFile(this.keys);

    return { key: rawKey, apiKey };
  }

  /** Revoke a specific key by ID. Returns updated record or undefined. */
  revokeApiKey(keyId: string): ApiKey | undefined {
    const key = this.keys.get(keyId);
    if (!key) return undefined;

    key.isActive = false;
    key.revokedAt = Date.now();
    this.keys.set(keyId, key);
    saveToFile(this.keys);
    return key;
  }

  /** Validate raw key by hash. Updates lastUsedAt on success. */
  validateApiKey(rawKey: string): { valid: boolean; apiKey?: ApiKey } {
    const hash = hashKey(rawKey);
    for (const key of this.keys.values()) {
      if (key.keyHash === hash) {
        if (!key.isActive) return { valid: false };
        key.lastUsedAt = Date.now();
        this.keys.set(key.id, key);
        saveToFile(this.keys);
        return { valid: true, apiKey: key };
      }
    }
    return { valid: false };
  }

  /** List all keys for a license — prefix + status only, no full key returned. */
  listApiKeys(licenseId: string): Omit<ApiKey, 'keyHash'>[] {
    const result: Omit<ApiKey, 'keyHash'>[] = [];
    for (const key of this.keys.values()) {
      if (key.licenseId === licenseId) {
        const { keyHash: _omit, ...safe } = key;
        result.push(safe);
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  private getActiveKeysForLicense(licenseId: string): ApiKey[] {
    return Array.from(this.keys.values()).filter(
      (k) => k.licenseId === licenseId && k.isActive
    );
  }
}

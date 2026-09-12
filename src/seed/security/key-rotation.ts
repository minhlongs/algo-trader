/**
 * Key Rotation Utilities
 *
 * Provides safe key rotation workflow for tenant-scoped encryption keys.
 * Uses version-prefixed payloads and dual-key read to ensure zero-downtime rotation.
 */

import { logger } from '../../shared/utils/logger';
import {
  encryptForTenant,
  decryptForTenant,
  validateEncryptionConfig,
  generateMasterKey,
} from './crypto';
import { type RotateMasterKeyResult } from './key-rotation-types';

export * from './key-rotation-types';
export * from './key-rotation-worker';

/**
 * Re-encrypt a tenant's credentials with current master key.
 * Used during key rotation to migrate all data to new key version.
 * Returns count of re-encrypted fields.
 */
export async function reEncryptTenantCredentials(
  tenantId: string,
  fields: string[],
  getEncryptedRecords: (tenantId: string) => Promise<Record<string, string | null>>,
  updateEncryptedRecord: (tenantId: string, field: string, newEncryptedValue: string) => Promise<void>,
): Promise<number> {
  const records = await getEncryptedRecords(tenantId);
  let reEncryptedCount = 0;

  for (const field of fields) {
    const encryptedValue = records[field];
    if (!encryptedValue || typeof encryptedValue !== 'string') {
      continue;
    }

    try {
      // Decrypt with current/previous key (dual-read supported by decryptForTenant)
      const plaintext = decryptForTenant(encryptedValue, tenantId, field);

      // Re-encrypt with current master key (will get v1: prefix)
      const newEncrypted = encryptForTenant(plaintext, tenantId, field);

      // Only update if different (avoids unnecessary writes)
      if (newEncrypted !== encryptedValue) {
        await updateEncryptedRecord(tenantId, field, newEncrypted);
        reEncryptedCount++;
      }
    } catch (err) {
      logger.error('[KeyRotation] Re-encryption failed', {
        tenantId,
        field,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with other fields - don't fail entire rotation on one field
    }
  }

  return reEncryptedCount;
}

/**
 * Rotate master key: generate new key, re-encrypt all tenant data, update env.
 * This is a multi-step process that must be coordinated with deployment.
 */
export async function rotateMasterKey(
  getAllTenantIds: () => Promise<string[]>,
  getEncryptedRecords: (tenantId: string) => Promise<Record<string, string | null>>,
  updateEncryptedRecord: (tenantId: string, field: string, newEncryptedValue: string) => Promise<void>,
  fields: string[] = ['apiKey', 'apiSecret', 'passphrase', 'privateKey'],
): Promise<RotateMasterKeyResult> {
  // Step 1: Generate new master key
  const newMasterKey = generateMasterKey();

  logger.info('[KeyRotation] Generated new master key', {
    keyPreview: `${newMasterKey.slice(0, 8)}...${newMasterKey.slice(-8)}`,
  });

  // Step 2: Validate current config (should have both current and previous)
  const config = validateEncryptionConfig();
  if (!config.hasPreviousKey) {
    throw new Error('Key rotation requires previous key to be set (CREDENTIALS_ENCRYPTION_KEY_PREVIOUS)');
  }

  // Step 3: Get all tenants
  const tenantIds = await getAllTenantIds();
  let totalReEncrypted = 0;

  // Step 4: Re-encrypt each tenant
  for (const tenantId of tenantIds) {
    const count = await reEncryptTenantCredentials(
      tenantId,
      fields,
      getEncryptedRecords,
      updateEncryptedRecord,
    );
    totalReEncrypted += count;
  }

  logger.info('[KeyRotation] Re-encryption complete', {
    tenantsProcessed: tenantIds.length,
    totalFieldsReEncrypted: totalReEncrypted,
  });

  return {
    newMasterKey,
    reEncryptedCount: totalReEncrypted,
    tenantsProcessed: tenantIds.length,
  };
}

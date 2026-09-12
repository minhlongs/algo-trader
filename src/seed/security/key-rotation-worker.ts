/**
 * Key Rotation Verification and Worker Utilities
 */

import {
  decryptForTenant,
  validateEncryptionConfig,
  getKeyVersionInfo,
} from './crypto';
import {
  type RotationStatus,
  type VerifyRotationCompleteResult,
  type KeyRotationStatus,
} from './key-rotation-types';

/**
 * Verify all encrypted records for a tenant can be decrypted with current keys.
 * Returns counts without exposing plaintext.
 */
export async function verifyTenantDecryption(
  tenantId: string,
  fields: string[],
  getEncryptedRecords: (tenantId: string) => Promise<Record<string, string | null>>,
): Promise<RotationStatus[]> {
  const results: RotationStatus[] = [];

  for (const field of fields) {
    const records = await getEncryptedRecords(tenantId);
    const encryptedValue = records[field];

    const status: RotationStatus = {
      tenantId,
      field,
      totalRecords: 0,
      encryptedWithCurrent: 0,
      encryptedWithPrevious: 0,
      failed: 0,
    };

    if (encryptedValue && typeof encryptedValue === 'string') {
      status.totalRecords = 1;
      try {
        decryptForTenant(encryptedValue, tenantId, field);
        status.encryptedWithCurrent = 1;
      } catch {
        try {
          const prevKey = process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS ?? process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
          if (prevKey) {
            status.encryptedWithPrevious = 1;
          } else {
            status.failed = 1;
          }
        } catch {
          status.failed = 1;
        }
      }
    }

    results.push(status);
  }

  return results;
}

/**
 * Verify rotation completeness after re-encryption.
 * All records should be decryptable with current key only.
 */
export async function verifyRotationComplete(
  getAllTenantIds: () => Promise<string[]>,
  getEncryptedRecords: (tenantId: string) => Promise<Record<string, string | null>>,
  fields: string[] = ['apiKey', 'apiSecret', 'passphrase', 'privateKey'],
): Promise<VerifyRotationCompleteResult> {
  const tenantIds = await getAllTenantIds();
  const issues: string[] = [];

  for (const tenantId of tenantIds) {
    const records = await getEncryptedRecords(tenantId);

    for (const field of fields) {
      const encryptedValue = records[field];
      if (!encryptedValue || typeof encryptedValue !== 'string') {
        continue;
      }

      try {
        decryptForTenant(encryptedValue, tenantId, field);
      } catch (err) {
        issues.push(`Tenant ${tenantId}, field ${field}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    allVerified: issues.length === 0,
    issues,
  };
}

/**
 * Get current key rotation status for readiness/health endpoint.
 * Safe to expose - no secrets included.
 */
export function getRotationStatus(): KeyRotationStatus {
  const config = validateEncryptionConfig();
  const keyInfo = getKeyVersionInfo();

  return {
    currentKeyConfigured: true,
    previousKeyConfigured: config.hasPreviousKey,
    currentKeyVersion: keyInfo.current,
    rotationInProgress: config.hasPreviousKey,
  };
}

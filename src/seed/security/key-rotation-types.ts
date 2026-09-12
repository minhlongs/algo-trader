/**
 * Key Rotation Types & Interfaces
 */

/**
 * Rotation status for a specific tenant+field combination.
 */
export interface RotationStatus {
  tenantId: string;
  field: string;
  totalRecords: number;
  encryptedWithCurrent: number;
  encryptedWithPrevious: number;
  failed: number;
}

export interface RotateMasterKeyResult {
  newMasterKey: string;
  reEncryptedCount: number;
  tenantsProcessed: number;
}

export interface VerifyRotationCompleteResult {
  allVerified: boolean;
  issues: string[];
}

export interface KeyRotationStatus {
  currentKeyConfigured: boolean;
  previousKeyConfigured: boolean;
  currentKeyVersion: number;
  rotationInProgress: boolean;
}

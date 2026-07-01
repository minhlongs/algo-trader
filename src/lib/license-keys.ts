/**
 * License Keys — re-export barrel
 * Actual implementations split into:
 *   - license-key-crypto.ts (generation, validation, encryption)
 *   - license-key-lifecycle.ts (creation, activation, invites, store)
 */

// Re-export everything for backward compatibility
export {
  generateLicenseKey,
  validateLicenseKeyFormat,
  extractTierFromKey,
  encryptLicenseKey,
  decryptLicenseKey,
  type LicenseKey,
  type BetaInvite,
} from './license-key-crypto';

export {
  createLicenseKey,
  createBetaInvite,
  activateLicenseKey,
  isLicenseExpired,
  getDefaultMaxUsage,
  generateInviteEmail,
  LicenseStore,
} from './license-key-lifecycle';

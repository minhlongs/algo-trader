/**
 * Pure license key validation, tier formatting, and output helpers for activate-license command.
 */

import { logger } from '../../shared/utils/logger';
import {
  activateLicenseKey,
  type extractTierFromKey,
  type LicenseStore,
} from '../../lib/license-keys';

export type LicenseTier = NonNullable<ReturnType<typeof extractTierFromKey>>;

export function getMaxUsageForTier(tier: LicenseTier): number {
  return tier === 'free' ? 100 : tier === 'pro' ? 10000 : 100000;
}

export function buildNewLicenseEntry(key: string, tier: LicenseTier, now = new Date()) {
  const iso = now.toISOString();
  return {
    id: `lic_${now.getTime()}`,
    key,
    tier,
    status: 'active' as const,
    createdAt: iso,
    activatedAt: iso,
    usageCount: 0,
    maxUsage: getMaxUsageForTier(tier),
  };
}

export function applyLicenseStoreActivation(
  store: LicenseStore,
  key: string,
  tier: LicenseTier,
): 'already_active' | 'revoked' | 'activated' {
  const existingLicense = store.getLicenseByKey(key);
  if (existingLicense) {
    if (existingLicense.status === 'active') {
      logger.info('✅ License already activated!\n');
      logger.info(`  Tier: ${existingLicense.tier.toUpperCase()}`);
      logger.info(`  Usage: ${existingLicense.usageCount}/${existingLicense.maxUsage}`);
      if (existingLicense.expiresAt) {
        logger.info(`  Expires: ${new Date(existingLicense.expiresAt).toLocaleDateString()}`);
      }
      logger.info('');
      return 'already_active';
    }

    if (existingLicense.status === 'revoked') {
      logger.info('❌ This license has been revoked\n');
      return 'revoked';
    }

    activateLicenseKey(existingLicense);
    logger.info('✅ License activated successfully!\n');
    return 'activated';
  }

  store.saveLicense(buildNewLicenseEntry(key, tier));
  logger.info('✅ License activated successfully!\n');
  return 'activated';
}

export function logActivationComplete(tier: LicenseTier): void {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🎉 ACTIVATION COMPLETE!');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.info('Next steps:');
  logger.info('  1. Run `algo-trader quickstart` to start trading');
  logger.info('  2. Access premium features with your tier');
  logger.info('  3. Check usage: `algo-trader status`\n');

  if (tier === 'free') {
    logger.info('⚠️  Free tier limit: 100 API calls/month');
    logger.info('   Upgrade to Pro for unlimited trading\n');
  }
}

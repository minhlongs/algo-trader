/**
 * License Activation Command
 * Activate beta invite license key with rate limiting and encryption
 */

import { logger } from '../../shared/utils/logger';
import {
  validateLicenseKeyFormat,
  extractTierFromKey,
  LicenseStore,
  activateLicenseKey,
  encryptLicenseKey,
} from '../../lib/license-keys';
import {
  RATE_LIMIT_MAX_ATTEMPTS,
  checkRateLimit,
  recordRateLimitHit,
  getClientIdentifier,
} from './activate-license-rate-limit';
import {
  ENV_PATH,
  promptLicenseKey,
  saveEncryptedLicenseToEnv,
} from './activate-license-storage';

export {
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
  getRedisClient,
  checkRateLimit,
  recordRateLimitHit,
  getClientIdentifier,
} from './activate-license-rate-limit';

export {
  ENV_PATH,
  promptLicenseKey,
  saveEncryptedLicenseToEnv,
} from './activate-license-storage';

export async function runActivateCommand(licenseKey?: string): Promise<void> {
  logger.info('\n🔑 Algo Trader License Activation\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get license key from argument or prompt
  const key = licenseKey || (await promptLicenseKey());

  if (!key) {
    logger.info('❌ No license key provided.\n');
    logger.info('Usage: algo-trader activate <your-license-key>');
    logger.info('   or: algo-trader activate\n');
    return;
  }

  // Step 0: Check rate limit
  const clientId = getClientIdentifier();
  logger.info('🔒 Checking activation rate limit...');
  const rateLimit = await checkRateLimit(clientId);

  if (!rateLimit.allowed) {
    const resetMinutes = Math.ceil((rateLimit.resetAt - Date.now()) / 60000);
    logger.info(`❌ Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_ATTEMPTS} activations per hour.\n`);
    logger.info(`   Try again in ${resetMinutes} minutes.\n`);
    return;
  }

  if (rateLimit.remaining < RATE_LIMIT_MAX_ATTEMPTS) {
    logger.info(`⚠️  ${rateLimit.remaining} activations remaining this hour\n`);
  } else {
    logger.info('✅ Rate limit check passed\n');
  }

  // Step 1: Validate format
  logger.info('📝 Validating license key format...');
  const validation = validateLicenseKeyFormat(key);

  if (!validation.valid) {
    await recordRateLimitHit(clientId);
    logger.info(`❌ Invalid license key: ${validation.error}\n`);
    return;
  }
  logger.info('✅ License key format valid\n');

  // Step 2: Extract tier
  const tier = extractTierFromKey(key);
  if (!tier) {
    await recordRateLimitHit(clientId);
    logger.info('❌ Could not determine license tier\n');
    return;
  }
  logger.info(`📊 License tier: ${tier.toUpperCase()}\n`);

  // Step 3: Store license (in production, this would call API)
  const store = LicenseStore.getInstance();

  // Check if already activated
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
      return;
    }

    if (existingLicense.status === 'revoked') {
      logger.info('❌ This license has been revoked\n');
      return;
    }

    // Activate pending license
    activateLicenseKey(existingLicense);
    logger.info('✅ License activated successfully!\n');
  } else {
    // Create new license entry
    const newLicense = {
      id: `lic_${Date.now()}`,
      key,
      tier,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      usageCount: 0,
      maxUsage: tier === 'free' ? 100 : tier === 'pro' ? 10000 : 100000,
    };
    store.saveLicense(newLicense);
    logger.info('✅ License activated successfully!\n');
  }

  // Step 4: Encrypt and save to .env
  logger.info('🔐 Encrypting license key for secure storage...');
  let encryptedKey: string;
  try {
    encryptedKey = encryptLicenseKey(key);
    logger.info('✅ License key encrypted (AES-256-CBC)\n');
  } catch (error) {
    logger.info(`❌ Encryption failed: ${(error as Error).message}\n`);
    logger.info('💡 Make sure LICENSE_ENCRYPTION_KEY is set in your .env file\n');
    await recordRateLimitHit(clientId);
    return;
  }

  logger.info('💾 Saving encrypted license key to configuration...');
  saveEncryptedLicenseToEnv(encryptedKey);
  logger.info(`✅ Saved to: ${ENV_PATH}\n`);

  // Step 5: Show next steps
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

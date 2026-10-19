/**
 * Onboarding Service — Customer signup, email verification, license activation
 * Flow: signup -> verify (6-digit code) -> activate (creates license)
 * Storage: PostgreSQL onboarding_signups table (migration 044)
 */

import * as crypto from 'crypto';
import type { PoolClient } from 'pg';
import { LicenseService } from './license-service';
import type { LicenseTier } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';
import { registerDripRecipient } from '../../desk/jobs/welcome-email-drip';
import { getDbClient } from '../../db/postgres-client';
import {
  PENDING_TTL_MS,
  type SignupRequest,
  type SignupResult,
  type ActivationResult,
} from './onboarding-types';
import {
  generateSixDigitCode,
  sendVerificationEmail,
  isValidEmail,
  buildApiInstructions,
} from './onboarding-helpers';
import {
  checkActiveLicense,
  checkPendingSignup,
  expireOldPendingSignups,
  insertPendingSignup,
  getPendingSignup,
  markSignupStatus,
  getVerifiedSignup,
} from './onboarding-db';

export class OnboardingService {
  private static instance: OnboardingService;
  private constructor() {}

  static getInstance(): OnboardingService {
    if (!OnboardingService.instance) {
      OnboardingService.instance = new OnboardingService();
    }
    return OnboardingService.instance;
  }

  /**
   * Step 1: Begin signup flow.
   * Validates email, rejects duplicates, generates 6-digit code, persists to onboarding_signups.
   */
  async signup(req: SignupRequest): Promise<SignupResult> {
    const email = req.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    const client = await getDbClient().connect();
    try {
      if (await checkActiveLicense(client, email)) {
        throw new Error('Email already has an active license');
      }

      if (await checkPendingSignup(client, email)) {
        throw new Error('Signup already pending. Check your verification code.');
      }

      await expireOldPendingSignups(client, email);

      const verificationToken = generateSixDigitCode();
      const pendingId = crypto.randomUUID();
      const tierEnum = req.tier as LicenseTier;

      await insertPendingSignup(client, pendingId, email, tierEnum, verificationToken);

      const emailSent = await sendVerificationEmail(email, verificationToken);
      if (!emailSent) {
        logger.info(`[Onboarding] DEV ONLY -- code for ${email}: ${verificationToken} (expires in 15 min)`);
      }

      const expiresAt = Date.now() + PENDING_TTL_MS;
      return { pendingId, email, verificationToken, expiresAt };
    } finally {
      client.release();
    }
  }

  /**
   * Step 2: Verify the 6-digit code.
   * Checks token validity and TTL, marks signup as verified.
   */
  async verify(email: string, code: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const client = await getDbClient().connect();
    try {
      const row = await getPendingSignup(client, normalizedEmail);
      if (!row) {
        throw new Error('No pending signup found for this email');
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        await markSignupStatus(client, row.id, 'expired');
        throw new Error('Verification code has expired. Please sign up again.');
      }

      if (row.verification_code !== code.trim()) {
        throw new Error('Invalid verification code');
      }

      await markSignupStatus(client, row.id, 'verified');
      logger.info(`[Onboarding] Email verified: ${normalizedEmail}`);
    } finally {
      client.release();
    }
  }

  /**
   * Step 3: Activate -- creates license via LicenseService.
   * Requires prior verification. Updates signup row on success.
   */
  async activate(email: string): Promise<ActivationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const client = await getDbClient().connect();
    try {
      const row = await getVerifiedSignup(client, normalizedEmail);
      if (!row) {
        throw new Error('No verified signup found. Complete verification first.');
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        await markSignupStatus(client, row.id, 'expired');
        throw new Error('Session expired. Please sign up again.');
      }

      const tier = row.tier as LicenseTier;
      const licenseService = LicenseService.getInstance();
      const license = await licenseService.createLicense({
        name: normalizedEmail,
        tier,
      });

      await markSignupStatus(client, row.id, 'activated', license.key);

      logger.info(`[Onboarding] License activated for ${normalizedEmail}: ${license.key} (${tier})`);

      registerDripRecipient(normalizedEmail, tier);
      const apiInstructions = buildApiInstructions(license.key, tier);

      return { licenseKey: license.key, tier, apiInstructions };
    } finally {
      client.release();
    }
  }
}

// Re-exports for backward compatibility
export { PENDING_TTL_MS, type SignupRequest, type SignupResult, type ActivationResult } from './onboarding-types';

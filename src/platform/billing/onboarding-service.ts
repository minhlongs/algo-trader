/**
 * Onboarding Service
 * RaaS Phase 16 - Customer signup, email verification, license activation
 *
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
   * Validates email, rejects duplicates, generates 6-digit code,
   * persists to onboarding_signups table.
   */
  async signup(req: SignupRequest): Promise<SignupResult> {
    const email = req.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    const client = await getDbClient().connect();
    try {
      // Check for existing active license
      const licResult = await client.query(
        `SELECT id FROM licenses WHERE name = $1 AND status = 'active' LIMIT 1`,
        [email],
      );
      if (licResult.rows.length > 0) {
        throw new Error('Email already has an active license');
      }

      // Check for non-expired pending signup
      const pendingResult = await client.query(
        `SELECT id FROM onboarding_signups
         WHERE email = $1 AND status = 'pending' AND expires_at > NOW()`,
        [email],
      );
      if (pendingResult.rows.length > 0) {
        throw new Error('Signup already pending. Check your verification code.');
      }

      // Expire old pending rows for this email
      await client.query(
        `UPDATE onboarding_signups SET status = 'expired'
         WHERE email = $1 AND status = 'pending' AND expires_at <= NOW()`,
        [email],
      );

      const verificationToken = generateSixDigitCode();
      const pendingId = crypto.randomUUID();
      const tierEnum = req.tier as LicenseTier;

      await client.query(
        `INSERT INTO onboarding_signups (id, email, tier, verification_code, expires_at, status)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes', 'pending')`,
        [pendingId, email, tierEnum, verificationToken],
      );

      const emailSent = await sendVerificationEmail(email, verificationToken);
      if (!emailSent) {
        logger.info(
          `[Onboarding] DEV ONLY -- code for ${email}: ${verificationToken} (expires in 15 min)`,
        );
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
      const result = await client.query(
        `SELECT id, verification_code, expires_at FROM onboarding_signups
         WHERE email = $1 AND status = 'pending'`,
        [normalizedEmail],
      );

      if (result.rows.length === 0) {
        throw new Error('No pending signup found for this email');
      }

      const row = result.rows[0];
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await client.query(
          `UPDATE onboarding_signups SET status = 'expired' WHERE id = $1`,
          [row.id],
        );
        throw new Error('Verification code has expired. Please sign up again.');
      }

      if (row.verification_code !== code.trim()) {
        throw new Error('Invalid verification code');
      }

      await client.query(
        `UPDATE onboarding_signups SET status = 'verified' WHERE id = $1`,
        [row.id],
      );
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
      const result = await client.query(
        `SELECT id, tier, expires_at FROM onboarding_signups
         WHERE email = $1 AND status = 'verified'`,
        [normalizedEmail],
      );

      if (result.rows.length === 0) {
        throw new Error('No verified signup found. Complete verification first.');
      }

      const row = result.rows[0];
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await client.query(
          `UPDATE onboarding_signups SET status = 'expired' WHERE id = $1`,
          [row.id],
        );
        throw new Error('Session expired. Please sign up again.');
      }

      const tier = row.tier as LicenseTier;
      const licenseService = LicenseService.getInstance();
      const license = await licenseService.createLicense({
        name: normalizedEmail,
        tier,
      });

      await client.query(
        `UPDATE onboarding_signups
         SET status = 'activated', license_key = $1, activated_at = NOW()
         WHERE id = $2`,
        [license.key, row.id],
      );

      logger.info(
        `[Onboarding] License activated for ${normalizedEmail}: ${license.key} (${tier})`,
      );

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

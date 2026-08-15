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
import { LicenseTier } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';
import { EmailService } from '../notifications/email-service';
import { registerDripRecipient } from '../../desk/jobs/welcome-email-drip';
import { getDbClient } from '../../db/postgres-client';

/** TTL for pending signups: 15 minutes in ms */
const PENDING_TTL_MS = 15 * 60 * 1000;

export interface SignupRequest {
  email: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  walletAddress?: string;
}

export interface SignupResult {
  pendingId: string;
  email: string;
  verificationToken: string;
  expiresAt: number;
}

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
    if (!this.isValidEmail(email)) {
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

      const verificationToken = this.generateSixDigitCode();
      const pendingId = crypto.randomUUID();
      const tierEnum = req.tier as LicenseTier;

      await client.query(
        `INSERT INTO onboarding_signups (id, email, tier, verification_code, expires_at, status)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes', 'pending')`,
        [pendingId, email, tierEnum, verificationToken],
      );

      const emailSent = await this.sendVerificationEmail(email, verificationToken);
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
  async activate(
    email: string,
  ): Promise<{ licenseKey: string; tier: LicenseTier; apiInstructions: string }> {
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
      const apiInstructions = this.buildApiInstructions(license.key, tier);

      return { licenseKey: license.key, tier, apiInstructions };
    } finally {
      client.release();
    }
  }

  private generateSixDigitCode(): string {
    const code = crypto.randomInt(0, 1_000_000);
    return code.toString().padStart(6, '0');
  }

  private async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    try {
      const emailSvc = EmailService.getInstance();
      if (!emailSvc.isInitialized()) {
        emailSvc.initialize();
      }
      if (!emailSvc.isInitialized()) {
        logger.warn('[Onboarding] SendGrid not configured, code logged to console only');
        return false;
      }
      const safeCode = code.replace(/[^0-9]/g, '');
      const sent = await emailSvc.send({
        to: email,
        subject: `CashClaw: Your verification code is ${safeCode}`,
        body: `Your CashClaw verification code is: ${safeCode}\n\nThis code expires in 15 minutes.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#00D4AA;margin-bottom:8px">CashClaw</h2>
            <p>Your verification code is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#0B0E11;color:#00D4AA;text-align:center;border-radius:8px;margin:16px 0">${safeCode}</div>
            <p style="color:#888;font-size:14px">Expires in 15 minutes. Ignore if you did not request this.</p>
          </div>`,
      });
      logger.info(`[Onboarding] Verification email sent to ${email}`);
      return sent;
    } catch (err) {
      logger.warn(`[Onboarding] Email send failed for ${email}, code logged to console`, { err });
      return false;
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private buildApiInstructions(licenseKey: string, tier: LicenseTier): string {
    return [
      `Welcome to Algo Trader RaaS!`,
      `Your license key: ${licenseKey}`,
      `Tier: ${tier}`,
      ``,
      `Usage: Include your license key in API requests:`,
      `  Header: X-License-Key: ${licenseKey}`,
      `  Or query param: ?license=${licenseKey}`,
      ``,
      `Docs: https://algo-trader.pages.dev/docs`,
    ].join('\n');
  }
}

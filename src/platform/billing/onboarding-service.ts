/**
 * Onboarding Service
 * RaaS Phase 16 - Customer signup, email verification, license activation
 *
 * Flow: signup → verify (6-digit code) → activate (creates license)
 * Storage: in-memory Map with 15-minute TTL (no DB needed for MVP)
 */

import * as crypto from 'crypto';
import { LicenseService } from './license-service';
import { LicenseTier } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';
import { EmailService } from '../notifications/email-service';
import { registerDripRecipient } from '../../desk/jobs/welcome-email-drip';

/** TTL for pending signups: 15 minutes in ms */
const PENDING_TTL_MS = 15 * 60 * 1000;

export interface SignupRequest {
  email: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  walletAddress?: string; // optional, for BYOK
}

export interface SignupResult {
  pendingId: string;
  email: string;
  verificationToken: string; // 6-digit code
  expiresAt: number; // epoch ms
}

interface PendingSignup {
  pendingId: string;
  email: string;
  tier: LicenseTier;
  walletAddress?: string;
  verificationToken: string;
  expiresAt: number;
  verified: boolean;
}

export class OnboardingService {
  private static instance: OnboardingService;

  /** In-memory store of pending signups: email → PendingSignup */
  private pending: Map<string, PendingSignup> = new Map();

  private constructor() {}

  static getInstance(): OnboardingService {
    if (!OnboardingService.instance) {
      OnboardingService.instance = new OnboardingService();
    }
    return OnboardingService.instance;
  }

  /**
   * Step 1: Begin signup flow.
   * Validates email format, rejects duplicates (active license or pending),
   * generates a 6-digit verification token, stores pending signup.
   */
  async signup(req: SignupRequest): Promise<SignupResult> {
    const email = req.email.trim().toLowerCase();

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check for existing active license on this email
    const licenseService = LicenseService.getInstance();
    const existingLicenses = await licenseService.listLicenses({ take: 1000 });
    const hasActiveLicense = existingLicenses.licenses.some(
      (l) => l.name === email && l.status === 'active'
    );
    if (hasActiveLicense) {
      throw new Error('Email already has an active license');
    }

    // Check for non-expired pending signup
    const existing = this.pending.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      throw new Error('Signup already pending. Check your verification code.');
    }

    const verificationToken = this.generateSixDigitCode();
    const expiresAt = Date.now() + PENDING_TTL_MS;
    const pendingId = crypto.randomUUID();

    const tierEnum = req.tier as LicenseTier;

    this.pending.set(email, {
      pendingId,
      email,
      tier: tierEnum,
      walletAddress: req.walletAddress,
      verificationToken,
      expiresAt,
      verified: false,
    });

    // Send verification email via SendGrid (fallback: log to console in dev only)
    const emailSent = await this.sendVerificationEmail(email, verificationToken);
    if (!emailSent) {
      logger.info(`[Onboarding] DEV ONLY — code for ${email}: ${verificationToken} (expires in 15 min)`);
    }

    return { pendingId, email, verificationToken, expiresAt };
  }

  /**
   * Step 2: Verify the 6-digit code.
   * Checks token validity and TTL, marks signup as verified.
   */
  async verify(email: string, code: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const pending = this.pending.get(normalizedEmail);

    if (!pending) {
      throw new Error('No pending signup found for this email');
    }

    if (Date.now() > pending.expiresAt) {
      this.pending.delete(normalizedEmail);
      throw new Error('Verification code has expired. Please sign up again.');
    }

    if (pending.verificationToken !== code.trim()) {
      throw new Error('Invalid verification code');
    }

    pending.verified = true;
    this.pending.set(normalizedEmail, pending);

    logger.info(`[Onboarding] Email verified: ${normalizedEmail}`);
  }

  /**
   * Step 3: Activate — creates license via LicenseService.
   * Requires prior successful verification. Cleans up pending entry on success.
   */
  async activate(email: string): Promise<{ licenseKey: string; tier: LicenseTier; apiInstructions: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const pending = this.pending.get(normalizedEmail);

    if (!pending) {
      throw new Error('No pending signup found for this email');
    }

    if (!pending.verified) {
      throw new Error('Email not verified. Complete verification first.');
    }

    if (Date.now() > pending.expiresAt) {
      this.pending.delete(normalizedEmail);
      throw new Error('Session expired. Please sign up again.');
    }

    const licenseService = LicenseService.getInstance();
    const license = await licenseService.createLicense({
      name: normalizedEmail,
      tier: pending.tier,
    });

    // Clean up pending entry
    this.pending.delete(normalizedEmail);

    logger.info(`[Onboarding] License activated for ${normalizedEmail}: ${license.key} (${pending.tier})`);

    // Register for welcome email drip sequence
    registerDripRecipient(normalizedEmail, pending.tier);

    const apiInstructions = this.buildApiInstructions(license.key, pending.tier);

    return {
      licenseKey: license.key,
      tier: pending.tier,
      apiInstructions,
    };
  }

  /** Generate a 6-digit numeric verification code */
  private generateSixDigitCode(): string {
    const code = crypto.randomInt(0, 1_000_000);
    return code.toString().padStart(6, '0');
  }

  /** Send verification code via SendGrid; returns true if sent, false if degraded */
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
        body: `Your CashClaw verification code is: ${safeCode}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, ignore this email.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#00D4AA;margin-bottom:8px">CashClaw</h2>
            <p>Your verification code is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#0B0E11;color:#00D4AA;text-align:center;border-radius:8px;margin:16px 0">${safeCode}</div>
            <p style="color:#888;font-size:14px">This code expires in 15 minutes. If you did not request this, ignore this email.</p>
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

import * as crypto from 'crypto';
import type { LicenseTier } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';
import { EmailService } from '../notifications/email-service';

export function generateSixDigitCode(): string {
  const code = crypto.randomInt(0, 1_000_000);
  return code.toString().padStart(6, '0');
}

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
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

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function buildApiInstructions(licenseKey: string, tier: LicenseTier): string {
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

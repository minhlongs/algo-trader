/**
 * Referral Code & Fraud Logging Helpers
 * Lightweight utilities for legacy 8-character alphanumeric referral codes
 * and background fraud analysis logging.
 */

import { logger } from '../../shared/utils/logger';
import type { FraudDetector } from './fraud-detector';

const LEGACY_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LEGACY_CODE_LENGTH = 8;

/**
 * Generate a random 8-character alphanumeric referral code.
 * NOTE: Uses Math.random — suitable only for non-security-sensitive identifiers.
 */
export function generateUniqueCode(): string {
  let code = '';
  for (let i = 0; i < LEGACY_CODE_LENGTH; i++) {
    code += LEGACY_CODE_CHARS.charAt(Math.floor(Math.random() * LEGACY_CODE_CHARS.length));
  }
  return code;
}

/**
 * Validate that a code matches the 8-character uppercase alphanumeric format.
 */
export function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/**
 * Resolve and validate a referral code (using customCode if provided, otherwise generating one).
 */
export function resolveAndValidateCode(
  customCode: string | undefined,
  generateFn: () => string = generateUniqueCode,
  validateFn: (c: string) => boolean = isValidCodeFormat,
): string {
  const code = customCode || generateFn();
  if (!validateFn(code)) {
    throw new Error('Invalid referral code format. Must be 8 alphanumeric characters.');
  }
  return code;
}

/**
 * Run async fraud detection in background and log result or error.
 */
export function triggerAsyncFraudAnalysis(
  detector: FraudDetector,
  trackingId: string,
  ip: string,
  userAgent: string,
): void {
  Promise.resolve(detector.detectFraud(trackingId, ip, userAgent))
    .then((result) => {
      if (!result) return;
      logger.info('[Referral] Fraud analysis complete', {
        trackingId,
        score: result.score,
        isBlocked: result.isBlocked,
        reasons: result.reasons,
      });
    })
    .catch((err) => {
      logger.error('[Referral] Fraud detection error', { error: err, trackingId });
    });
}

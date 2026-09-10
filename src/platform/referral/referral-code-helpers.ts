/**
 * Referral Code Helpers
 * Lightweight utilities for legacy 8-character alphanumeric referral codes.
 * Used internally by ReferralService; not to be confused with referral-code-generator.ts
 * which produces crypto-secure tenant-prefixed codes.
 */

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

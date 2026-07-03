/**
 * Referral Code Generator
 * Secure, tenant-prefixed referral code generation using crypto.randomBytes
 */

import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1
const RANDOM_PART_LENGTH = 5;

/**
 * Generate a referral code for a given tenant.
 * Format: {TENANT_PREFIX}-{RANDOM}  (e.g. "TEN-ABC12")
 * Uses crypto.randomBytes for secure randomness.
 */
export function generateReferralCode(tenantId: string): string {
  const prefix = tenantId.slice(0, 3).toUpperCase();
  const random = Array.from(randomBytes(RANDOM_PART_LENGTH))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
  return `${prefix}-${random}`;
}

/**
 * Validate a referral code matches the expected format.
 * Accepts: 3 uppercase alphanumeric, hyphen, 5 uppercase alphanumeric (no I,O,0,1).
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z0-9]{3}-[A-Z0-9]{5}$/.test(code);
}

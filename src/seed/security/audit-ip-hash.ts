/**
 * IP address hashing for audit-log module.
 *
 * Computes a deterministic SHA-256 hex digest so raw IP addresses
 * never enter the database.  Missing or blank input is normalised to
 * a constant hash of the string `'redacted'` so the same "unknown"
 * always produces the same digest (enables grouping in queries).
 *
 * @module security/audit-ip-hash
 */

import crypto from 'node:crypto';

/** Constant used when the real IP cannot be determined. */
const IP_REDACTED = 'redacted';

/**
 * SHA-256 hex digest of a raw IP address string.
 *
 * @param rawIp - dotted-decimal IPv4, colon-hex IPv6, or IPv4-mapped IPv6
 * @returns 64-char lowercase hex string
 *
 * @example
 * hashIpAddress('198.51.100.42');
 * // → 'a3c8d2e4f1b74590...'
 *
 * hashIpAddress(undefined);   // no x-forwarded-for header
 * // → 'c7b0ea3d5f81a246...'  (hash of 'redacted')
 */
export function hashIpAddress(rawIp: string | undefined | null): string {
  const input =
    typeof rawIp === 'string' && rawIp.trim() !== ''
      ? rawIp.trim()
      : IP_REDACTED;
  return crypto.createHash('sha256').update(input).digest('hex');
}

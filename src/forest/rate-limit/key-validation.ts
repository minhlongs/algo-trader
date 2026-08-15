/**
 * Redis key-prefix validation for the rate-limiter.
 *
 * A malformed prefix would silently corrupt every key; fail fast instead.
 *
 * @module forest/rate-limit/key-validation
 */

export function validateKeyPrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix === '') return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) {
    throw new Error(
      `[RateLimiter] Invalid keyPrefix "${prefix}" — use alphanumeric, hyphens or underscores only`,
    );
  }
  return prefix;
}

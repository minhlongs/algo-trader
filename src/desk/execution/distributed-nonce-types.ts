/**
 * Distributed Nonce Manager Types and Constants
 */

/** Milliseconds before a reserved nonce is considered stale and released */
export const NONCE_TTL_MS = 30_000;

/** Redis key prefix for nonce counters */
export const NONCE_KEY_PREFIX = 'nonce:';

export interface NonceReservation {
  walletAddress: string;
  nonce: number;
  reservedAt: number;
}

/** Helper to format Redis key for a wallet's nonce counter */
export function formatNonceKey(walletAddress: string): string {
  return `${NONCE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

/**
 * Lua script for conditional nonce decrement:
 * Only decrements if Redis value is exactly reservation.nonce + 1.
 */
export const NONCE_RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('decr', KEYS[1])
  else
    return nil
  end
`;

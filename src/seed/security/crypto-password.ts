import * as crypto from 'crypto';
import { KEY_LENGTH } from './crypto-keys';

/**
 * Hash a password using PBKDF2 with SHA-256.
 *
 * @param password - Password to hash
 * @param key - Optional key for deterministic hashing (e.g., for testing)
 * @returns Hash string in format: iterations:salt:hash:derivedKey (all base64)
 * @throws TypeError on invalid inputs
 */
export function hashPassword(password: string, key?: Buffer): string {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  const salt = crypto.randomBytes(16);
  const iterations = 600000; // OWASP 2024 recommendation: 600k+ PBKDF2-SHA256
  const derivedKey = key ?? crypto.randomBytes(KEY_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
  return [iterations.toString(), salt.toString('base64'), hash.toString('base64'), derivedKey.toString('base64')].join(':');
}

/**
 * Verify a password against a hash.
 *
 * @param password - Password to verify
 * @param hash - Hash string from hashPassword
 * @param key - Optional key for deterministic hashing (must match hashPassword call)
 * @returns True if password matches
 * @throws TypeError on invalid inputs
 */
export function verifyPassword(password: string, hash: string, key?: Buffer): Promise<boolean> {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  if (typeof hash !== 'string') {
    throw new TypeError('hash must be a string');
  }

  const parts = hash.split(':');
  if (parts.length !== 4) {
    throw new TypeError('Invalid hash format');
  }

  const iterations = parseInt(parts[0], 10);
  const salt = Buffer.from(parts[1], 'base64');
  const expectedHash = Buffer.from(parts[2], 'base64');

  const computedHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
  return Promise.resolve(crypto.timingSafeEqual(computedHash, expectedHash));
}

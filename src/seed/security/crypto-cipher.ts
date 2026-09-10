import * as crypto from 'crypto';
import { ALGORITHM, IV_LENGTH, TAG_LENGTH, KEY_LENGTH } from './crypto-keys';

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param plaintext - String to encrypt (must be string, not empty)
 * @param key - 32-byte Buffer (256-bit key)
 * @returns Object with ciphertext, iv, tag as base64 strings
 * @throws TypeError on invalid inputs
 * @throws Error on crypto failure
 */
export function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  if (typeof plaintext !== 'string') {
    throw new TypeError('plaintext must be a string');
  }
  if (!(key instanceof Buffer) || key.length !== KEY_LENGTH) {
    throw new TypeError(`key must be a ${KEY_LENGTH}-byte Buffer`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a ciphertext with AES-256-GCM.
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @param iv - Base64-encoded initialization vector
 * @param tag - Base64-encoded authentication tag
 * @param key - 32-byte Buffer (256-bit key)
 * @returns Decrypted plaintext string
 * @throws TypeError on invalid inputs
 * @throws Error on auth failure (wrong key, tampered data, etc.)
 */
export function decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof tag !== 'string') {
    throw new TypeError('ciphertext, iv, and tag must be strings');
  }
  if (!(key instanceof Buffer) || key.length !== KEY_LENGTH) {
    throw new TypeError(`key must be a ${KEY_LENGTH}-byte Buffer`);
  }

  try {
    const ciphertextBuf = Buffer.from(ciphertext, 'base64');
    const ivBuf = Buffer.from(iv, 'base64');
    const tagBuf = Buffer.from(tag, 'base64');

    if (ivBuf.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (tagBuf.length !== TAG_LENGTH) {
      throw new Error('Invalid tag length');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
    decipher.setAuthTag(tagBuf);
    const plaintext = Buffer.concat([
      decipher.update(ciphertextBuf),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`decryption failed: ${msg}`);
  }
}

/**
 * Test-only: encrypt with specific master key (bypasses env).
 */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const p = encrypt(plaintext, key);
  return [p.ciphertext, p.iv, p.tag].join(':');
}

/**
 * Test-only: decrypt with specific master key (bypasses env).
 */
export function decryptWithKey(packed: string, key: Buffer): string {
  const [ct, iv, tag] = packed.split(':');
  return decrypt(ct, iv, tag, key);
}

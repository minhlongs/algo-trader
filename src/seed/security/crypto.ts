import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit per NIST SP 800-38D
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-GCM encryption utilities — zero external dependencies.
 *
 * Uses Node.js built-in `crypto` module only.
 */

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param plaintext - value to encrypt (UTF-8)
 * @param key - 32-byte symmetric key buffer
 * @returns { ciphertext, iv, tag } — all base64-encoded strings
 * @throws TypeError on invalid inputs
 */
export function encrypt(
  plaintext: string,
  key: Buffer,
): { ciphertext: string; iv: string; tag: string } {
  if (typeof plaintext !== 'string') {
    throw new TypeError('plaintext must be a string');
  }
  const key32 = Buffer.isBuffer(key) ? key : Buffer.from(key);
  if (key32.length !== KEY_LENGTH) {
    throw new TypeError(
      `encryption key must be ${KEY_LENGTH} bytes (got ${key32.length})`,
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key32, iv, {
    authTagLength: TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt ciphertext produced by {@link encrypt}.
 *
 * @param ciphertext - base64-encoded encrypted payload
 * @param iv - base64-encoded 12-byte IV
 * @param tag - base64-encoded 16-byte auth tag
 * @param key - 32-byte symmetric key (same key used for encryption)
 * @returns original plaintext string
 * @throws Error on auth failure (wrong key, tampered data, etc.)
 */
export function decrypt(
  ciphertext: string,
  iv: string,
  tag: string,
  key: Buffer,
): string {
  const key32 = Buffer.isBuffer(key) ? key : Buffer.from(key);
  if (key32.length !== KEY_LENGTH) {
    throw new TypeError(
      `encryption key must be ${KEY_LENGTH} bytes (got ${key32.length})`,
    );
  }

  try {
    const ivBuf = Buffer.from(iv, 'base64');
    const tagBuf = Buffer.from(tag, 'base64');
    const ctBuf = Buffer.from(ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key32, ivBuf, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tagBuf);

    const plaintext = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`decryption failed: ${msg}`);
  }
}

/**
 * Generate a cryptographically random 256-bit (32-byte) key.
 *
 * @returns Buffer suitable for use as the `key` argument
 *          in {@link encrypt} and {@link decrypt}.
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Hash a password using PBKDF2-SHA256 with 100,000 iterations.
 *
 * The returned string is self-contained: it encodes the salt, IV,
 * and encrypted derived key so {@link verifyPassword} can re-derive
 * and check without external state.
 *
 * Format: `pbkdf2_iterations:salt_base64:iv_base64:ciphertext_base64:tag_base64`
 *
 * By default derives the master key from `(process.env.ENCRYPTION_MASTER_KEY ?? process.env.CREDENTIALS_ENCRYPTION_KEY)`
 * (first 32 bytes). Pass `key` explicitly for testing.
 *
 * @param password - plaintext password to hash
 * @param key - optional 32-byte master key; falls back to env var in production
 * @returns opaque hash string for storage
 */
export function hashPassword(
  password: string,
  key?: Buffer,
): string {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }

  const masterKey = key ?? envKey();

  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    100_000,
    KEY_LENGTH,
    'sha256',
  );

  // Encode as hex string before encrypting so the round-trip through
  // UTF-8 in decrypt() produces byte-identical output.
  const derivedHex = derivedKey.toString('hex');
  const { ciphertext, iv, tag } = encrypt(derivedHex, masterKey);

  return ['100000', salt.toString('base64'), iv, ciphertext, tag].join(':');
}

/**
 * Verify a plaintext password against a hash from {@link hashPassword}.
 *
 * Re-derives the PBKDF2 key and compares the recovered derived key
 * using constant-time equality.
 *
 * @param password - candidate plaintext
 * @param hash - stored hash string
 * @param key - optional 32-byte master key; falls back to `envKey()` if not provided
 * @returns true if the password matches
 */
export function verifyPassword(
  password: string,
  hash: string,
  key?: Buffer,
): boolean {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  if (typeof hash !== 'string') {
    throw new TypeError('hash must be a string');
  }

  // Lenient split — tolerate accidental extra colons by slicing the tail.
  const segs = hash.split(':');
  if (segs.length < 5) return false;

  const [iterationsStr, saltB64, ivB64, ctB64, tagB64, ..._tail] = segs;
  const iterations = Number(iterationsStr);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let derivedKey: Buffer;
  try {
    derivedKey = crypto.pbkdf2Sync(
      password,
      Buffer.from(saltB64, 'base64'),
      iterations,
      KEY_LENGTH,
      'sha256',
    );
  } catch {
    return false;
  }

  let recoveredHex: string;
  try {
    const masterKey = key ?? envKey();
    recoveredHex = decrypt(ctB64, ivB64, tagB64, masterKey);
  } catch {
    return false;
  }

  // Constant-time compare via crypto.timingSafeEqual
  return timingSafeEqual(derivedKey.toString('hex'), recoveredHex);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * AES-256-GCM encrypt a raw Buffer, returning base64-encoded {ciphertext, iv, tag}.
 */
function sealEnvelope(
  secret: Buffer,
  masterKey: Buffer,
): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: TAG_LENGTH,
  });
  const ct = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/** Read 32 bytes from ENCRYPTION_MASTER_KEY env var (falls back to CREDENTIALS_ENCRYPTION_KEY). */
function envKey(): Buffer {
  const raw = (process.env.ENCRYPTION_MASTER_KEY ?? process.env.CREDENTIALS_ENCRYPTION_KEY);
  if (typeof raw !== 'string' || raw.length < KEY_LENGTH) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY environment variable is required (64 hex characters, CREDENTIALS_ENCRYPTION_KEY accepted as fallback)',
    );
  }
  return Buffer.from(raw.slice(0, KEY_LENGTH * 2), 'hex');
}

/**
 * SHA-256 hex digest of a raw IP address string.
 *
 * Designed for audit-log IP hashing — deterministic, no PII leakage,
 * and collision-resistant for practical purposes (2^128 work factor).
 *
 * @param rawIp - dotted-decimal IPv4, IPv6, or `undefined` / empty
 * @returns 64-char lowercase hex string
 *
 * @example
 * hashIpAddress('198.51.100.42')  // 'a3c8d2e4f1...'
 * hashIpAddress(undefined)         // hash of 'redacted'
 * hashIpAddress('')                // hash of 'redacted'
 */
export function hashIpAddress(rawIp: string | undefined | null): string {
  const normalized = typeof rawIp === 'string' && rawIp.trim() !== ''
    ? rawIp.trim()
    : 'redacted';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/** Constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    const max = Math.max(aBuf.length, bBuf.length);
    return crypto.timingSafeEqual(
      Buffer.concat([aBuf, Buffer.alloc(max - aBuf.length, 0)]),
      Buffer.concat([bBuf, Buffer.alloc(max - bBuf.length, 0)]),
    );
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/** Pack {ciphertext, iv, tag} into colon-delimited string for DB storage. */
export function encryptString(plaintext: string): string {
 const key = envKey();
 const p = encrypt(plaintext, key);
 return [p.ciphertext, p.iv, p.tag].join(':');
}

/** Unpack colon-delimited string → decrypt → return plaintext. */
export function decryptString(packed: string): string {
 const [ct, iv, tag] = packed.split(':');
 if (!ct || !iv || !tag) throw new Error('Invalid encrypted payload format');
 const key = envKey();
 return decrypt(ct, iv, tag, key);
}

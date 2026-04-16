/**
 * BYOK KMS Wrap — Envelope Encryption
 * Platform holds KEK (Key Encryption Key); subscriber secret is wrapped under DEK.
 * DEK is ephemeral AES-256-GCM; KEK wraps DEK using AES-256-GCM.
 * Plaintext key never persisted — only wrapped form stored.
 *
 * Architecture:
 *   subscriberSecret ──encrypt(DEK)──> ciphertext
 *   DEK ──wrap(KEK)──> wrappedDek  (stored in D1)
 */

import crypto from 'crypto';

const AES_KEY_BYTES = 32; // AES-256
const GCM_IV_BYTES = 12;

/** KEK version + material (supports rotation) */
export interface KekMaterial {
  version: number;
  keyHex: string; // 32-byte hex
}

export interface WrappedKeyBundle {
  /** base64(ciphertext of subscriberSecret encrypted with DEK) */
  encryptedSecret: string;
  /** base64(DEK encrypted with KEK) */
  wrappedDek: string;
  /** hex IV used when wrapping DEK with KEK */
  dekIvHex: string;
  /** hex auth tag from DEK wrap */
  dekAuthTagHex: string;
  /** hex IV used when encrypting secret with DEK */
  secretIvHex: string;
  /** hex auth tag from secret encryption */
  secretAuthTagHex: string;
  /** KEK version used — needed for rotation */
  kekVersion: number;
}

export interface UnwrapResult {
  /** Recovered plaintext subscriber secret */
  plaintext: string;
}

/** 64-char all-zero hex = 32 zero bytes — valid AES-256 dev key, never used in prod */
const DEV_KEK_HEX = '0'.repeat(64);

function getKek(): KekMaterial {
  const hex = process.env.CITADEL_KEK_HEX;
  if (!hex || hex.length !== 64) {
    // Dev fallback — deterministic 32-byte all-zero key; prod MUST set CITADEL_KEK_HEX
    return { version: 1, keyHex: DEV_KEK_HEX };
  }
  const version = parseInt(process.env.CITADEL_KEK_VERSION ?? '1', 10);
  return { version, keyHex: hex };
}

function aesGcmEncrypt(
  keyHex: string,
  plaintext: Buffer,
): { ciphertext: Buffer; ivHex: string; authTagHex: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
  };
}

function aesGcmDecrypt(
  keyHex: string,
  ciphertext: Buffer,
  ivHex: string,
  authTagHex: string,
): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Wrap a subscriber secret under envelope encryption.
 * 1. Generate ephemeral DEK (AES-256).
 * 2. Encrypt subscriberSecret with DEK.
 * 3. Wrap DEK with platform KEK.
 * Returns WrappedKeyBundle — safe to store in D1.
 */
export function wrapSubscriberSecret(subscriberSecret: string): WrappedKeyBundle {
  const kek = getKek();

  // Generate ephemeral DEK
  const dek = crypto.randomBytes(AES_KEY_BYTES);

  // Encrypt the subscriber secret with DEK
  const secretBuf = Buffer.from(subscriberSecret, 'utf8');
  const secretEnc = aesGcmEncrypt(dek.toString('hex'), secretBuf);

  // Wrap DEK with KEK
  const dekEnc = aesGcmEncrypt(kek.keyHex, dek);

  return {
    encryptedSecret: secretEnc.ciphertext.toString('base64'),
    wrappedDek: dekEnc.ciphertext.toString('base64'),
    dekIvHex: dekEnc.ivHex,
    dekAuthTagHex: dekEnc.authTagHex,
    secretIvHex: secretEnc.ivHex,
    secretAuthTagHex: secretEnc.authTagHex,
    kekVersion: kek.version,
  };
}

/**
 * Unwrap a WrappedKeyBundle to recover the subscriber secret.
 * Requires the platform KEK to be set in env.
 */
export function unwrapSubscriberSecret(bundle: WrappedKeyBundle): UnwrapResult {
  const kek = getKek();

  if (bundle.kekVersion !== kek.version) {
    throw new Error(
      `KEK version mismatch: bundle uses v${bundle.kekVersion}, current KEK is v${kek.version}. Re-wrap required.`,
    );
  }

  // Unwrap DEK
  const dekCiphertext = Buffer.from(bundle.wrappedDek, 'base64');
  const dek = aesGcmDecrypt(kek.keyHex, dekCiphertext, bundle.dekIvHex, bundle.dekAuthTagHex);

  // Decrypt secret
  const secretCiphertext = Buffer.from(bundle.encryptedSecret, 'base64');
  const plaintext = aesGcmDecrypt(
    dek.toString('hex'),
    secretCiphertext,
    bundle.secretIvHex,
    bundle.secretAuthTagHex,
  );

  return { plaintext: plaintext.toString('utf8') };
}

/** Derive a new DEK wrapped under a new KEK version — for key rotation */
export function rewrapBundle(
  bundle: WrappedKeyBundle,
  oldKekHex: string,
  newKek: KekMaterial,
): WrappedKeyBundle {
  // Unwrap with old KEK
  const dekCiphertext = Buffer.from(bundle.wrappedDek, 'base64');
  const dek = aesGcmDecrypt(oldKekHex, dekCiphertext, bundle.dekIvHex, bundle.dekAuthTagHex);

  // Re-wrap DEK with new KEK
  const dekEnc = aesGcmEncrypt(newKek.keyHex, dek);

  return {
    ...bundle,
    wrappedDek: dekEnc.ciphertext.toString('base64'),
    dekIvHex: dekEnc.ivHex,
    dekAuthTagHex: dekEnc.authTagHex,
    kekVersion: newKek.version,
  };
}

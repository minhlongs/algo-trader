/**
 * License Key Crypto & Validation
 * Key generation, format validation, encryption/decryption, tier extraction.
 * Split from license-keys.ts for 200-line modularization.
 */

import crypto from 'crypto';

export interface LicenseKey {
  id: string;
  key: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'pending' | 'active' | 'revoked' | 'expired';
  email?: string;
  createdAt: string;
  activatedAt?: string;
  expiresAt?: string;
  maxUsage?: number;
  usageCount: number;
  metadata?: Record<string, string>;
}

export interface BetaInvite {
  id: string;
  email: string;
  licenseKeyId: string;
  status: 'sent' | 'accepted' | 'expired';
  sentAt: string;
  acceptedAt?: string;
  expiresAt: string;
}

const TIER_PREFIXES: Record<string, string> = {
  free: 'beta',
  pro: 'pro',
  enterprise: 'ent',
};

const ACTIVATION_SECRET = process.env.LICENSE_ACTIVATION_SECRET;
if (!ACTIVATION_SECRET) {
  throw new Error('LICENSE_ACTIVATION_SECRET environment variable is required.');
}

const ENCRYPTION_KEY = process.env.LICENSE_ENCRYPTION_KEY;

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('LICENSE_ENCRYPTION_KEY is not set.');
  }
  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error(`LICENSE_ENCRYPTION_KEY must be exactly 32 characters (current: ${ENCRYPTION_KEY.length}).`);
  }
  return Buffer.from(ENCRYPTION_KEY, 'utf-8');
}

/** Generate a unique license key with tier prefix and checksum */
export function generateLicenseKey(tier: 'free' | 'pro' | 'enterprise' = 'free'): string {
  const prefix = TIER_PREFIXES[tier];
  const timestamp = Date.now().toString(36).toUpperCase();
  const segment1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const segment2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const checksum = crypto
    .createHash('sha256')
    .update(`${prefix}-${timestamp}-${segment1}-${segment2}-${ACTIVATION_SECRET}`)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();
  return `ALGO-${prefix}-${timestamp}-${segment1}-${segment2}-${checksum}`;
}

/** Validate license key format and checksum */
export function validateLicenseKeyFormat(key: string): { valid: boolean; error?: string } {
  if (!key) return { valid: false, error: 'License key is required' };
  const parts = key.split('-');
  if (parts.length !== 6) return { valid: false, error: 'Invalid license key format' };
  if (parts[0] !== 'ALGO') return { valid: false, error: 'Invalid license key prefix' };
  const tier = parts[1]!.toLowerCase();
  if (!['beta', 'pro', 'ent'].includes(tier)) return { valid: false, error: 'Invalid license tier' };
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(`${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}-${ACTIVATION_SECRET}`)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();
  if (parts[5] !== expectedChecksum) return { valid: false, error: 'Invalid license key checksum' };
  return { valid: true };
}

/** Extract tier from license key string */
export function extractTierFromKey(key: string): 'free' | 'pro' | 'enterprise' | null {
  const parts = key.split('-');
  if (parts.length !== 6) return null;
  switch (parts[1]!.toLowerCase()) {
    case 'beta': return 'free';
    case 'pro': return 'pro';
    case 'ent': return 'enterprise';
    default: return null;
  }
}

/** Encrypt license key for secure storage (AES-256-CBC) */
export function encryptLicenseKey(key: string): string {
  const encKey = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/** Decrypt license key from storage */
export function decryptLicenseKey(encrypted: string): string {
  const encKey = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted license key format');
  const iv = Buffer.from(parts[0]!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
  let decrypted = decipher.update(parts[1]!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

import crypto from 'crypto';

function getCredentialsKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is required');
  }
  const keyBuffer = Buffer.from(key, 'utf8');
  if (keyBuffer.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes');
  }
  return keyBuffer;
}

/**
 * Encrypt a plain text string using AES-256-GCM
 */
export function encrypt(text: string): string {
  const key = getCredentialsKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt a cipher text string using AES-256-GCM
 */
export function decrypt(encrypted: string): string {
  const key = getCredentialsKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credentials format');
  }
  const iv = Buffer.from(parts[0]!, 'hex');
  const tag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = parts[2]!;

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

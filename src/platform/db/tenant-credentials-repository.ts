import { query } from '../../shared/db/postgres-client';
import { encryptForTenant, decryptForTenant } from '../../seed/security/crypto';

export interface TenantCredentials {
  apiKey: string | null;
  apiSecret: string | null;
  passphrase: string | null;
  privateKey: string | null;
  // publicKey is NOT encrypted — stored as plaintext for identification only
  publicKey: string | null;
}

export class TenantCredentialsRepository {
  /**
   * Save (insert or update) tenant credentials
   * All credential fields are encrypted with tenant-scoped DEK
   */
  async save(subscriberId: string, creds: TenantCredentials): Promise<void> {
    const encryptedApiKey = creds.apiKey ? encryptForTenant(creds.apiKey, subscriberId, 'apiKey') : null;
    const encryptedApiSecret = creds.apiSecret ? encryptForTenant(creds.apiSecret, subscriberId, 'apiSecret') : null;
    const encryptedPassphrase = creds.passphrase ? encryptForTenant(creds.passphrase, subscriberId, 'passphrase') : null;
    const encryptedPrivateKey = creds.privateKey ? encryptForTenant(creds.privateKey, subscriberId, 'privateKey') : null;
    // publicKey stored as plaintext (not encrypted) for identification only
    const publicKey = creds.publicKey ?? null;

    const sql = `
      INSERT INTO tenant_credentials (
        subscriber_id, api_key_encrypted, api_secret_encrypted, passphrase_encrypted, private_key_encrypted, public_key,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (subscriber_id) DO UPDATE SET
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        api_secret_encrypted = EXCLUDED.api_secret_encrypted,
        passphrase_encrypted = EXCLUDED.passphrase_encrypted,
        private_key_encrypted = EXCLUDED.private_key_encrypted,
        public_key = EXCLUDED.public_key,
        updated_at = NOW()
    `;

    await query(sql, [
      subscriberId,
      encryptedApiKey,
      encryptedApiSecret,
      encryptedPassphrase,
      encryptedPrivateKey,
      publicKey,
    ]);
  }

  /**
   * Get decrypted tenant credentials
   * Returns null if not found
   * Throws generic error on decryption failure (fail-closed)
   */
  async get(subscriberId: string): Promise<TenantCredentials | null> {
    const sql = `
      SELECT api_key_encrypted, api_secret_encrypted, passphrase_encrypted, private_key_encrypted, public_key
      FROM tenant_credentials
      WHERE subscriber_id = $1
    `;

    const result = await query(sql, [subscriberId]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Decrypt each field with tenant context; fail-closed on any decryption error
    let apiKey: string | null = null;
    let apiSecret: string | null = null;
    let passphrase: string | null = null;
    let privateKey: string | null = null;
    let publicKey: string | null = null;

    try {
      if (row.api_key_encrypted) {
        apiKey = decryptForTenant(String(row.api_key_encrypted), subscriberId, 'apiKey');
      }
    } catch {
      throw new Error('decryption failed');
    }

    try {
      if (row.api_secret_encrypted) {
        apiSecret = decryptForTenant(String(row.api_secret_encrypted), subscriberId, 'apiSecret');
      }
    } catch {
      throw new Error('decryption failed');
    }

    try {
      if (row.passphrase_encrypted) {
        passphrase = decryptForTenant(String(row.passphrase_encrypted), subscriberId, 'passphrase');
      }
    } catch {
      throw new Error('decryption failed');
    }

    try {
      if (row.private_key_encrypted) {
        privateKey = decryptForTenant(String(row.private_key_encrypted), subscriberId, 'privateKey');
      }
    } catch {
      throw new Error('decryption failed');
    }

    try {
      if (row.public_key) {
        publicKey = String(row.public_key); // plaintext, no decryption needed
      }
    } catch {
      throw new Error('decryption failed');
    }

    return {
      apiKey,
      apiSecret,
      passphrase,
      privateKey,
      publicKey,
    };
  }

  /**
   * Delete tenant credentials
   */
  async delete(subscriberId: string): Promise<void> {
    const sql = 'DELETE FROM tenant_credentials WHERE subscriber_id = $1';
    await query(sql, [subscriberId]);
  }

  /**
   * Check if tenant has credentials configured
   */
  async exists(subscriberId: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM tenant_credentials WHERE subscriber_id = $1 LIMIT 1';
    const result = await query(sql, [subscriberId]);
    return result.rows.length > 0;
  }
}
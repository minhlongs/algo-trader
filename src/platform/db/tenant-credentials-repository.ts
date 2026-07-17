import { query } from '../../shared/db/postgres-client';
import { encryptString, decryptString } from '../../seed/security/crypto';

export interface TenantCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  privateKey: string;
}

export class TenantCredentialsRepository {
  /**
   * Save (insert or update) tenant credentials
   */
  async save(subscriberId: string, creds: TenantCredentials): Promise<void> {
    const encryptedApiKey = encryptString(creds.apiKey);
    const encryptedApiSecret = encryptString(creds.apiSecret);
    const encryptedPassphrase = encryptString(creds.passphrase);
    const encryptedPrivateKey = encryptString(creds.privateKey);
    const now = new Date();

    const sql = `
      INSERT INTO tenant_credentials (
        subscriber_id, api_key, api_secret, passphrase, private_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (subscriber_id) DO UPDATE SET
        api_key = EXCLUDED.api_key,
        api_secret = EXCLUDED.api_secret,
        passphrase = EXCLUDED.passphrase,
        private_key = EXCLUDED.private_key,
        updated_at = EXCLUDED.updated_at
    `;

    const params: (string | Date)[] = [
      subscriberId,
      encryptedApiKey,
      encryptedApiSecret,
      encryptedPassphrase,
      encryptedPrivateKey,
      now,
      now,
    ];

    await query(sql, params);
  }

  /**
   * Get tenant credentials and decrypt them
   */
  async get(subscriberId: string): Promise<TenantCredentials | null> {
    const sql = `
      SELECT api_key, api_secret, passphrase, private_key 
      FROM tenant_credentials 
      WHERE subscriber_id = $1
    `;
    const result = await query<{
      api_key: string;
      api_secret: string;
      passphrase: string;
      private_key: string;
    }>(sql, [subscriberId]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      apiKey: decryptString(row.api_key),
      apiSecret: decryptString(row.api_secret),
      passphrase: decryptString(row.passphrase),
      privateKey: decryptString(row.private_key),
    };
  }

  /**
   * Delete tenant credentials
   */
  async delete(subscriberId: string): Promise<void> {
    const sql = 'DELETE FROM tenant_credentials WHERE subscriber_id = $1';
    await query(sql, [subscriberId]);
  }
}

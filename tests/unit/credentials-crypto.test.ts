import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../src/shared/db/postgres-client', () => ({
  query: (sql: string, params?: (string | Date | number | boolean | null)[]) => mockQuery(sql, params),
}));

describe('Credentials Crypto Utilities', () => {
  const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const originalLicenseKey = process.env.LICENSE_ENCRYPTION_KEY;
  const originalLicenseSecret = process.env.LICENSE_ACTIVATION_SECRET;

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012'; // 32 bytes
    process.env.LICENSE_ENCRYPTION_KEY = '12345678901234567890123456789012'; // 32 bytes
    process.env.LICENSE_ACTIVATION_SECRET = 'secret';
    mockQuery.mockReset();
  });

  afterEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
    process.env.LICENSE_ENCRYPTION_KEY = originalLicenseKey;
    process.env.LICENSE_ACTIVATION_SECRET = originalLicenseSecret;
  });

  describe('GCM Encryption and Decryption', () => {
    it('should successfully encrypt and decrypt a string using AES-256-GCM', async () => {
      const { encrypt, decrypt } = await import('../../src/lib/credentials-crypto');
      const originalText = 'my-super-secret-password-123!';
      const encrypted = encrypt(originalText);
      expect(encrypted).toContain(':');
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should throw an error during encryption if CREDENTIALS_ENCRYPTION_KEY is missing', async () => {
      const { encrypt } = await import('../../src/lib/credentials-crypto');
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('CREDENTIALS_ENCRYPTION_KEY environment variable is required');
    });

    it('should throw an error during encryption if CREDENTIALS_ENCRYPTION_KEY is not 32 bytes', async () => {
      const { encrypt } = await import('../../src/lib/credentials-crypto');
      process.env.CREDENTIALS_ENCRYPTION_KEY = 'short-key';
      expect(() => encrypt('test')).toThrow('CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes');
    });

    it('should throw an error during decryption if format is invalid', async () => {
      const { decrypt } = await import('../../src/lib/credentials-crypto');
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted credentials format');
    });
  });

  describe('License Key Crypto Backward Compatibility', () => {
    it('should encrypt and decrypt using AES-256-GCM', async () => {
      const { encryptLicenseKey, decryptLicenseKey } = await import('../../src/lib/license-key-crypto');
      const licenseKey = 'ALGO-beta-timestamp-segment1-segment2-checksum';
      const encrypted = encryptLicenseKey(licenseKey);
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decryptLicenseKey(encrypted);
      expect(decrypted).toBe(licenseKey);
    });

    it('should fall back to CBC decryption if the encrypted string is in the 2-part format', async () => {
      const { decryptLicenseKey } = await import('../../src/lib/license-key-crypto');
      // Create a genuine CBC encrypted key using the legacy algorithm
      const key = Buffer.from(process.env.LICENSE_ENCRYPTION_KEY!, 'utf8');
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const text = 'ALGO-beta-legacy-cbc-key';
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const legacyFormat = iv.toString('hex') + ':' + encrypted;

      expect(legacyFormat.split(':')).toHaveLength(2);

      const decrypted = decryptLicenseKey(legacyFormat);
      expect(decrypted).toBe(text);
    });
  });

  describe('TenantCredentialsRepository', () => {
    it('should save credentials by encrypting them and inserting/updating in the DB', async () => {
      const { TenantCredentialsRepository } = await import('../../src/db/tenant-credentials-repository');
      const repo = new TenantCredentialsRepository();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const creds = {
        apiKey: 'api-key-val',
        apiSecret: 'api-secret-val',
        passphrase: 'passphrase-val',
        privateKey: 'private-key-val',
      };

      await repo.save('sub-1', creds);

      expect(mockQuery).toHaveBeenCalled();
      const [sql, params] = mockQuery.mock.calls[0] as [string, (string | Date | number | boolean | null)[]];
      expect(sql).toContain('INSERT INTO tenant_credentials');
      expect(sql).toContain('ON CONFLICT (subscriber_id) DO UPDATE');
      
      expect(params[0]).toBe('sub-1');
      // Verify values are encrypted (not plain text)
      expect(params[1]).not.toBe('api-key-val');
      expect(params[2]).not.toBe('api-secret-val');
      expect(params[3]).not.toBe('passphrase-val');
      expect(params[4]).not.toBe('private-key-val');
    });

    it('should retrieve credentials and decrypt them', async () => {
      const { TenantCredentialsRepository } = await import('../../src/db/tenant-credentials-repository');
      const repo = new TenantCredentialsRepository();

      const { encrypt } = await import('../../src/lib/credentials-crypto');
      const encryptedApiKey = encrypt('api-key-val');
      const encryptedApiSecret = encrypt('api-secret-val');
      const encryptedPassphrase = encrypt('passphrase-val');
      const encryptedPrivateKey = encrypt('private-key-val');

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            api_key: encryptedApiKey,
            api_secret: encryptedApiSecret,
            passphrase: encryptedPassphrase,
            private_key: encryptedPrivateKey,
          },
        ],
      });

      const creds = await repo.get('sub-1');
      expect(creds).not.toBeNull();
      expect(creds?.apiKey).toBe('api-key-val');
      expect(creds?.apiSecret).toBe('api-secret-val');
      expect(creds?.passphrase).toBe('passphrase-val');
      expect(creds?.privateKey).toBe('private-key-val');
    });

    it('should return null if subscriber credentials do not exist', async () => {
      const { TenantCredentialsRepository } = await import('../../src/db/tenant-credentials-repository');
      const repo = new TenantCredentialsRepository();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const creds = await repo.get('sub-non-existent');
      expect(creds).toBeNull();
    });

    it('should delete credentials', async () => {
      const { TenantCredentialsRepository } = await import('../../src/db/tenant-credentials-repository');
      const repo = new TenantCredentialsRepository();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.delete('sub-1');

      expect(mockQuery).toHaveBeenCalled();
      const [sql, params] = mockQuery.mock.calls[0] as [string, (string | Date | number | boolean | null)[]];
      expect(sql).toContain('DELETE FROM tenant_credentials');
      expect(params).toEqual(['sub-1']);
    });
  });
});

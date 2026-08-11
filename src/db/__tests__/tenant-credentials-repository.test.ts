import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantCredentials } from '../tenant-credentials-repository';

const store = new Map<string, { encrypted: Record<string, string | null>; public_key: string | null }>();

function resetStore() { store.clear(); }

function queryImpl(_sql: string, params?: unknown[]) {
  const sql = String(_sql);
  if (sql.includes('DELETE FROM tenant_credentials')) {
    const id = String(params?.[0] ?? '');
    store.delete(id);
    return { rows: [] };
  }
  if (sql.includes('INSERT INTO tenant_credentials')) {
    const id = String(params?.[0] ?? '');
    store.set(id, {
      encrypted: {
        api_key: params?.[1] ? String(params[1]) : null,
        api_secret: params?.[2] ? String(params[2]) : null,
        passphrase: params?.[3] ? String(params[3]) : null,
        private_key: params?.[4] ? String(params[4]) : null,
      },
      public_key: params?.[5] ? String(params[5]) : null,
    });
    return { rows: [] };
  }
  if (sql.includes('FROM tenant_credentials')) {
    const id = String(params?.[0] ?? '');
    const row = store.get(id);
    if (!row) return { rows: [] };
    return { rows: [{
      api_key_encrypted: row.encrypted.api_key,
      api_secret_encrypted: row.encrypted.api_secret,
      passphrase_encrypted: row.encrypted.passphrase,
      private_key_encrypted: row.encrypted.private_key,
      public_key: row.public_key,
    }] };
  }
  return { rows: [] };
}

function txImpl(fn: (client: { query: typeof queryImpl }) => Promise<unknown>) {
  return fn({ query: queryImpl });
}

vi.mock('../postgres-client', () => ({ query: queryImpl, transaction: txImpl }));

process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
import { TenantCredentialsRepository } from '../tenant-credentials-repository';

describe('tenant-credentials-repository (src/db) encryption', () => {
  let repo: TenantCredentialsRepository;

  const sample: TenantCredentials = {
    apiKey: 'plain-api',
    apiSecret: 'plain-secret',
    passphrase: 'plain-pass',
    privateKey: 'plain-key',
    publicKey: 'plain-pub',
  };

  beforeEach(() => {
    resetStore();
    repo = new TenantCredentialsRepository();
  });

  it('encrypts every sensitive field on save', async () => {
    await repo.save('sub-1', sample);
    const row = store.get('sub-1')!.encrypted;
    expect(row.api_key).not.toBe(sample.apiKey);
    expect(row.api_secret).not.toBe(sample.apiSecret);
    expect(row.passphrase).not.toBe(sample.passphrase);
    expect(row.private_key).not.toBe(sample.privateKey);
    expect(String(row.api_key).startsWith('v1:')).toBe(true);
  });

  it('returns null when subscriber missing', async () => {
    const result = await repo.get('missing');
    expect(result).toBeNull();
  });

  it('decrypts all fields correctly on get', async () => {
    await repo.save('sub-1', sample);
    const result = await repo.get('sub-1');
    expect(result).toEqual(sample);
  });

  it('handles null/undefined credential fields', async () => {
    const partialCreds: TenantCredentials = {
      apiKey: 'only-api',
      apiSecret: null,
      passphrase: undefined as any,
      privateKey: '',
      publicKey: 'pub',
    };
    await repo.save('sub-2', partialCreds);
    const result = await repo.get('sub-2');
    expect(result?.apiKey).toBe('only-api');
    expect(result?.apiSecret).toBeNull();
    expect(result?.passphrase).toBeNull();
    expect(result?.privateKey).toBeNull();
    expect(result?.publicKey).toBe('pub');
  });

  it('throws generic error on decryption failure (fail-closed)', async () => {
    await repo.save('sub-3', sample);
    const row = store.get('sub-3');
    if (row) {
      row.encrypted.api_key = 'v1:corrupted:data:here';
    }
    await expect(repo.get('sub-3')).rejects.toThrow('decryption failed');
  });

  it('exists returns true for saved credentials', async () => {
    await repo.save('sub-4', sample);
    expect(await repo.exists('sub-4')).toBe(true);
    expect(await repo.exists('missing')).toBe(false);
  });

  it('delete removes credentials', async () => {
    await repo.save('sub-5', sample);
    expect(await repo.exists('sub-5')).toBe(true);
    await repo.delete('sub-5');
    expect(await repo.exists('sub-5')).toBe(false);
  });
});
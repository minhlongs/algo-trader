import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantCredentials } from '../tenant-credentials-repository';

const store = new Map<string, { encrypted: Record<string, string> }>();

function resetStore() { store.clear(); }

function queryImpl(_sql: string, params?: unknown[]) {
  const sql = String(_sql);
  if (sql.includes('FROM tenant_credentials')) {
    const id = String(params?.[0] ?? '');
    const row = store.get(id);
    if (!row) return { rows: [] };
    return { rows: [row.encrypted] };
  }
  if (sql.includes('INSERT INTO tenant_credentials')) {
    const id = String(params?.[0] ?? '');
    store.set(id, {
      encrypted: {
        api_key: 'enc:' + String(params?.[1] ?? ''),
        api_secret: 'enc:' + String(params?.[2] ?? ''),
        passphrase: 'enc:' + String(params?.[3] ?? ''),
        private_key: 'enc:' + String(params?.[4] ?? ''),
      },
    });
  }
  return { rows: [] };
}

function txImpl(fn: (client: { query: typeof queryImpl }) => Promise<unknown>) {
  return fn({ query: queryImpl });
}

vi.mock('../../../shared/db/postgres-client', () => ({ query: queryImpl, transaction: txImpl }));

process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
import { TenantCredentialsRepository } from '../tenant-credentials-repository';

describe('tenant-credentials-repository encryption', () => {
  let repo: TenantCredentialsRepository;

  const sample: TenantCredentials = {
    apiKey: 'plain-api',
    apiSecret: 'plain-secret',
    passphrase: 'plain-pass',
    privateKey: 'plain-key',
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
  });

  it('returns null when subscriber missing', async () => {
    const result = await repo.get('missing');
    expect(result).toBeNull();
  });
});

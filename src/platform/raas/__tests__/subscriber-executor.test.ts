/**
 *
 * Subscriber Executor Tests
 *
 * Verifies DLP blocking, trade recording, and attestation ID generation.
 *
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('../../../shared/db/postgres-client', () => ({
  query: mockQuery,
  getDbClient: () => ({}),
  transaction: vi.fn().mockImplementation(async (fn: any) =>
    fn({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
  ),
  closeDbConnection: vi.fn(),
}));

vi.mock('../../db/tenant-credentials-repository', () => ({
  TenantCredentialsRepository: class {
    async get(subscriberId: string) {
      if (!subscriberId || subscriberId === 'tenant-without-creds') return null;
      return {
        apiKey: 'mock-key',
        apiSecret: 'mock-secret',
        passphrase: 'mock-passphrase',
        privateKey: 'mock-pkey',
      };
    }
  },
}));

import { SubscriberExecutor } from '../subscriber-executor';

describe('SubscriberExecutor', () => {
  let executor: SubscriberExecutor;

  beforeEach(() => {
    executor = new SubscriberExecutor();
    mockQuery.mockReset();
  });

  it('should throw if credentials do not exist', async () => {
    await expect(
      executor.execute({
        subscriberId: 'tenant-without-creds',
        strategyId: 'strat-1',
        marketPayload: {},
        capitalUsdt: 100,
      }),
    ).rejects.toThrow('Credentials not found for subscriber: tenant-without-creds');
  });

  it('should execute successfully if credentials exist', async () => {
    const result = await executor.execute({
      subscriberId: 'tenant-with-creds',
      strategyId: 'strat-1',
      marketPayload: {},
      capitalUsdt: 100,
    });
    expect(result.subscriberId).toBe('tenant-with-creds');
    expect(result.status).toBeDefined();
    expect(result.tradeId).toBeDefined();
    expect(result.attestationId).toBeDefined();
  });

  it('should block DLP-listed subscribers', async () => {
    const result = await executor.execute({
      subscriberId: 'blocked-user',
      strategyId: 'strat-1',
      marketPayload: {},
      capitalUsdt: 100,
    });
    expect(result.status).toBe('DLP_BLOCKED');
    expect(result.signal).toBe('HOLD');
  });

  it('should generate attestation ID', async () => {
    const result = await executor.execute({
      subscriberId: 'tenant-with-creds',
      strategyId: 'strat-1',
      marketPayload: {},
      capitalUsdt: 100,
    });
    expect(result.attestationId).toMatch(/^attest-/);
  });

  it('should record trade to database via query()', async () => {
    await executor.execute({
      subscriberId: 'tenant-with-creds',
      strategyId: 'strat-1',
      marketPayload: {},
      capitalUsdt: 100,
    });
    expect(mockQuery).toHaveBeenCalled();
  });
});

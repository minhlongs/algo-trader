/**
 * Subscriber Executor Tests
 * Verifies DLP blocking, trade recording, and attestation ID generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriberExecutor } from '../subscriber-executor';

vi.mock('../../db/postgres-client', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/postgres-client';
const mockQuery = vi.mocked(query);

describe('SubscriberExecutor', () => {
  let executor: SubscriberExecutor;

  beforeEach(() => {
    executor = new SubscriberExecutor();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  describe('execute — happy path', () => {
    it('returns a result with a non-empty attestationId', async () => {
      const result = await executor.execute({
        subscriberId: 'sub-ok',
        strategyId: 'strat-ema',
        marketPayload: { price: 42000, volume: 100 },
        capitalUsdt: 1000,
      });

      expect(result.subscriberId).toBe('sub-ok');
      expect(result.attestationId).toMatch(/^attest-sub-ok/);
      expect(result.tradeId).toBeTruthy();
      expect(['FILLED', 'PENDING']).toContain(result.status);
    });

    it('records trade to DB with subscriber_id and attestation_id', async () => {
      await executor.execute({
        subscriberId: 'sub-record',
        strategyId: 'strat-x',
        marketPayload: { foo: 'bar' },
        capitalUsdt: 500,
      });

      expect(mockQuery).toHaveBeenCalled();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('subscriber_id');
      expect(sql).toContain('attestation_id');
      expect(params).toContain('sub-record');
    });

    it('profit is non-negative for FILLED trades', async () => {
      const result = await executor.execute({
        subscriberId: 'sub-profit',
        strategyId: 'strat-ema',
        marketPayload: { a: 1 },
        capitalUsdt: 2000,
      });

      if (result.status === 'FILLED') {
        expect(result.profit).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('execute — DLP blocking', () => {
    it('returns DLP_BLOCKED status for blocked- prefix subscriber', async () => {
      const result = await executor.execute({
        subscriberId: 'blocked-tenant',
        strategyId: 'strat-y',
        marketPayload: { price: 100 },
        capitalUsdt: 1000,
      });

      expect(result.status).toBe('DLP_BLOCKED');
      expect(result.signal).toBe('HOLD');
      expect(result.profit).toBe(0);
    });

    it('still records DLP_BLOCKED trade to DB for audit', async () => {
      await executor.execute({
        subscriberId: 'blocked-audit',
        strategyId: 'strat-z',
        marketPayload: {},
        capitalUsdt: 500,
      });

      expect(mockQuery).toHaveBeenCalled();
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('DLP_BLOCKED');
    });
  });

  describe('execute — validation', () => {
    it('throws for empty subscriberId', async () => {
      await expect(
        executor.execute({
          subscriberId: '',
          strategyId: 'strat-a',
          marketPayload: {},
          capitalUsdt: 100,
        })
      ).rejects.toThrow('must be a non-empty string');
    });
  });

  describe('getRecentExecutions', () => {
    it('passes subscriber_id to query', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }, { id: 't2' }] } as never);

      const rows = await executor.getRecentExecutions('sub-history', 10);

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('sub-history');
      expect(rows).toHaveLength(2);
    });
  });
});

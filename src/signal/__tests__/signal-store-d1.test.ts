/**
 * Tests for SignalStoreD1 — D1/SQLite-backed SignalStore implementation.
 *
 * Mocks the PostgreSQL client (query) so all methods are exercised without a live database.
 * Strictly < 180 LOC, zero mocks bypass, zero :any.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { SignalStoreD1, signalStoreD1 } from '../signal-store-d1';
import type { Signal } from '../signal-types';

const BASE_SIGNAL: Signal = {
  id: 'sig-1',
  ts: 1_700_000_000_000,
  market: 'BTC-USD',
  side: 'BUY',
  size: 0.5,
  confidence: 0.8,
  strategy: 'momentum',
  ttl: 300,
  expiresAt: 1_700_000_000_000 + 300_000,
};

describe('SignalStoreD1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton / instance', () => {
    it('exports a singleton instance', () => {
      expect(signalStoreD1).toBeInstanceOf(SignalStoreD1);
    });

    it('creates distinct instances', () => {
      const a = new SignalStoreD1();
      const b = new SignalStoreD1();
      expect(a).not.toBe(b);
    });
  });

  describe('saveSignal', () => {
    it('persists a signal with correct fields and derived source', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.saveSignal(BASE_SIGNAL);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO signals');
      expect(call[0]).toContain('ON CONFLICT (id) DO NOTHING');
      expect(call[1]).toEqual([
        BASE_SIGNAL.id,
        BASE_SIGNAL.ts,
        BASE_SIGNAL.market,
        BASE_SIGNAL.side,
        BASE_SIGNAL.size,
        BASE_SIGNAL.confidence,
        BASE_SIGNAL.strategy,
        BASE_SIGNAL.ttl,
        BASE_SIGNAL.expiresAt,
        expect.any(Number),
        'legacy',
        0,
      ]);
    });

    it('sets source to qwen-m1max and paperOnly=1 for qwen-prefixed strategies', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await store.saveSignal({ ...BASE_SIGNAL, strategy: 'qwen-alpha', id: 'sig-2' });
      const call = mockQuery.mock.calls[0];
      expect(call[1][10]).toBe('qwen-m1max');
      expect(call[1][11]).toBe(1);
    });

    it('sets source for deepseek and swarm prefixed strategies', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValue({ rows: [] });
      await store.saveSignal({ ...BASE_SIGNAL, strategy: 'deepseek-v3', id: 'sig-3' });
      expect(mockQuery.mock.calls[0][1][10]).toBe('deepseek');
      await store.saveSignal({ ...BASE_SIGNAL, strategy: 'swarm-v1', id: 'sig-4' });
      expect(mockQuery.mock.calls[1][1][10]).toBe('swarm');
    });

    it('logs error and re-throws on query failure', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));
      await expect(store.saveSignal(BASE_SIGNAL)).rejects.toThrow('DB connection failed');
    });
  });

  describe('getSubscriptions', () => {
    it('returns mapped subscriptions from DB rows', async () => {
      const store = new SignalStoreD1();
      const dbRows = [
        {
          id: 'sub-1',
          subscriber_id: 'user-1',
          chat_id: 123456789,
          tier: 'ENTERPRISE',
          active: 1,
          created_at: 1_700_000_000_000,
          updated_at: 1_700_000_000_001,
        },
        {
          id: 'sub-2',
          subscriber_id: 'user-2',
          chat_id: null,
          tier: 'PRO',
          active: 1,
          created_at: 1_700_000_000_002,
          updated_at: 1_700_000_000_003,
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: dbRows });

      const result = await store.getSubscriptions();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sub-1');
      expect(result[0].chatId).toBe(123456789);
      expect(result[1].chatId).toBeUndefined();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no rows or on error', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await store.getSubscriptions()).toEqual([]);

      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      expect(await store.getSubscriptions()).toEqual([]);
    });
  });
});

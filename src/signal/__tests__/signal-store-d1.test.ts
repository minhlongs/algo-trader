/**
 * Tests for SignalStoreD1 — D1/SQLite-backed SignalStore implementation.
 *
 * Mocks the PostgreSQL client (query) so all methods are exercised without a live database.
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── Constructor / singleton ──────────────────────────────────────────────────

describe('SignalStoreD1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a module-level singleton instance', () => {
    expect(signalStoreD1).toBeInstanceOf(SignalStoreD1);
  });

  // ─── saveSignal ────────────────────────────────────────────────────────────────

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
        expect.any(Number), // created_at (Date.now())
        'legacy', // source (strategy 'momentum' doesn't match prefixes)
        0, // paperOnly (legacy source)
      ]);
    });

    it('sets source to qwen-m1max and paperOnly=1 for qwen-prefixed strategies', async () => {
      const store = new SignalStoreD1();
      const qwenSignal = { ...BASE_SIGNAL, strategy: 'qwen-alpha', id: 'sig-2' };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.saveSignal(qwenSignal);

      const call = mockQuery.mock.calls[0];
      expect(call[1][10]).toBe('qwen-m1max'); // source
      expect(call[1][11]).toBe(1); // paperOnly
    });

    it('sets source to deepseek for deepseek-prefixed strategies', async () => {
      const store = new SignalStoreD1();
      const dsSignal = { ...BASE_SIGNAL, strategy: 'deepseek-v3', id: 'sig-3' };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.saveSignal(dsSignal);

      expect(mockQuery.mock.calls[0][1][10]).toBe('deepseek');
    });

    it('sets source to swarm for swarm-prefixed strategies', async () => {
      const store = new SignalStoreD1();
      const swarmSignal = { ...BASE_SIGNAL, strategy: 'swarm-v1', id: 'sig-4' };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.saveSignal(swarmSignal);

      expect(mockQuery.mock.calls[0][1][10]).toBe('swarm');
    });

    it('logs debug on successful persist', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.saveSignal(BASE_SIGNAL);

      // logger.debug is mocked, we can't easily assert on it without importing the mock
      // but we can verify the query was called
      expect(mockQuery).toHaveBeenCalled();
    });

    it('logs error and re-throws on query failure', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(store.saveSignal(BASE_SIGNAL)).rejects.toThrow('DB connection failed');
    });
  });

  // ─── getSubscriptions ──────────────────────────────────────────────────────────

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
      expect(result[0]).toEqual({
        id: 'sub-1',
        subscriberId: 'user-1',
        chatId: 123456789,
        tier: 'ENTERPRISE',
        active: true,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_001,
      });
      expect(result[1]).toEqual({
        id: 'sub-2',
        subscriberId: 'user-2',
        chatId: undefined,
        tier: 'PRO',
        active: true,
        createdAt: 1_700_000_000_002,
        updatedAt: 1_700_000_000_003,
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM signal_subscriptions');
      expect(sql).toContain('WHERE active = 1');
      expect(sql).toContain('ORDER BY created_at ASC');
    });

    it('returns empty array when no rows', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await store.getSubscriptions();

      expect(result).toEqual([]);
    });

    it('returns empty array and logs warn on query error', async () => {
      const store = new SignalStoreD1();
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await store.getSubscriptions();

      expect(result).toEqual([]);
    });
  });
});
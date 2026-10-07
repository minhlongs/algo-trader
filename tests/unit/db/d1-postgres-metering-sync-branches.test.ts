import { describe, expect, it, vi } from 'vitest';
import { D1PostgresMeteringSync } from '../../../src/db/d1-postgres-metering-sync';
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  PostgresClientLike,
} from '../../../src/db/metering-sync-types';

describe('D1PostgresMeteringSync Branch Coverage', () => {
  it('handles error when fetching checkpoint and returns IDLE fallback', async () => {
    const mockD1: D1DatabaseLike = {
      prepare: vi.fn(),
    };
    const mockPg: PostgresClientLike = {
      query: vi.fn().mockRejectedValue(new Error('PG Connection Dead')),
    };

    const sync = new D1PostgresMeteringSync(mockD1, mockPg, { pipelineName: 'custom-pipe' });
    const cp = await sync.getCheckpoint();

    expect(cp.pipelineName).toBe('custom-pipe');
    expect(cp.lastD1Id).toBe(0);
    expect(cp.status).toBe('IDLE');
  });

  it('handles checkpoint failure logging when saveCheckpoint fails during error recovery', async () => {
    const mockStmt: D1PreparedStatementLike = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          {
            id: 999,
            tenant_id: 't-fail',
            metric_name: 'api_calls',
            metric_value: 1,
            period_start: '2026-10-01T00:00:00Z',
            period_end: '2026-10-01T01:00:00Z',
            recorded_at: '2026-10-01T00:00:00Z',
          },
        ],
      }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockD1: D1DatabaseLike = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    };

    let callCount = 0;
    const mockPg: PostgresClientLike = {
      query: vi.fn().mockImplementation(async (text: string) => {
        callCount++;
        if (text.includes('SELECT pipeline_name')) {
          return { rows: [], rowCount: 0 };
        }
        // Fail on any subsequent save or insert
        throw new Error('Total DB Crash');
      }),
    };

    const sync = new D1PostgresMeteringSync(mockD1, mockPg);
    const result = await sync.reconcileBatch();

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('Total DB Crash');
  });

  it('handles non-Error rejection in D1 fetchRecords', async () => {
    const mockStmt: D1PreparedStatementLike = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockRejectedValue('D1 raw string rejection'),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockD1: D1DatabaseLike = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    };
    const mockPg: PostgresClientLike = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    const sync = new D1PostgresMeteringSync(mockD1, mockPg);
    const result = await sync.reconcileBatch();

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.errors[0]).toContain('D1 raw string rejection');
  });
});

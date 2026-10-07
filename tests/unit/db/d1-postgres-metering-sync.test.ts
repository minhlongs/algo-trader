import { describe, expect, it, vi } from 'vitest';
import { D1PostgresMeteringSync } from '../../../src/db/d1-postgres-metering-sync';
import type {
  D1DatabaseLike,
  D1MetricRecord,
  D1PreparedStatementLike,
  PostgresClientLike,
  PostgresQueryResult,
  SyncStatus,
} from '../../../src/db/metering-sync-types';

describe('D1PostgresMeteringSync', () => {
  function createMocks(options?: {
    d1Records?: D1MetricRecord[];
    d1Error?: Error;
    pgErrorOnInsert?: Error;
    existingCheckpoint?: { lastD1Id: number; status: SyncStatus };
  }) {
    const pgQueries: Array<{ text: string; params?: unknown[] }> = [];

    const mockStmt: D1PreparedStatementLike = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockImplementation(async () => {
        if (options?.d1Error) throw options.d1Error;
        return { results: options?.d1Records ?? [] };
      }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockD1: D1DatabaseLike = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    };

    const mockPg: PostgresClientLike = {
      query: vi.fn().mockImplementation(async <T = unknown>(text: string, params?: unknown[]): Promise<PostgresQueryResult<T>> => {
        pgQueries.push({ text, params });
        if (options?.pgErrorOnInsert && text.includes('INSERT INTO central_metering_ledger')) {
          throw options.pgErrorOnInsert;
        }
        if (text.includes('SELECT pipeline_name')) {
          if (options?.existingCheckpoint) {
            return {
              rows: [
                {
                  pipeline_name: 'test-pipeline',
                  last_d1_id: options.existingCheckpoint.lastD1Id,
                  last_synced_at: new Date().toISOString(),
                  status: options.existingCheckpoint.status,
                },
              ] as T[],
              rowCount: 1,
            };
          }
          return { rows: [] as T[], rowCount: 0 };
        }
        return { rows: [] as T[], rowCount: 1 };
      }),
    };

    return { mockD1, mockPg, mockStmt, pgQueries };
  }

  it('reconciles batch from D1 into Postgres and updates checkpoint', async () => {
    const records: D1MetricRecord[] = [
      {
        id: 101,
        tenant_id: 't-1',
        metric_name: 'api_calls',
        metric_value: 50,
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-01T01:00:00Z',
        recorded_at: '2026-10-01T00:30:00Z',
      },
      {
        id: 102,
        tenant_id: 't-2',
        metric_name: 'strategy_runs',
        metric_value: 12,
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-01T01:00:00Z',
        recorded_at: '2026-10-01T00:45:00Z',
      },
    ];

    const { mockD1, mockPg, pgQueries } = createMocks({ d1Records: records });
    const sync = new D1PostgresMeteringSync(mockD1, mockPg, { pipelineName: 'test-pipeline' });

    const result = await sync.reconcileBatch();

    expect(result.success).toBe(true);
    expect(result.status).toBe('SUCCESS');
    expect(result.processedCount).toBe(2);
    expect(result.syncedCount).toBe(2);
    expect(result.checkpoint).toBe(102);

    const insertCalls = pgQueries.filter((q) => q.text.includes('INSERT INTO central_metering_ledger'));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].params?.[0]).toBe('t-1');
    expect(insertCalls[0].params?.[1]).toBe('api_calls');
    expect(insertCalls[0].params?.[2]).toBe(50);
  });

  it('returns IDLE when no records are available in D1', async () => {
    const { mockD1, mockPg } = createMocks({ d1Records: [] });
    const sync = new D1PostgresMeteringSync(mockD1, mockPg);

    const result = await sync.reconcileBatch();

    expect(result.success).toBe(true);
    expect(result.status).toBe('IDLE');
    expect(result.processedCount).toBe(0);
    expect(result.syncedCount).toBe(0);
  });

  it('resumes from existing checkpoint stored in Postgres', async () => {
    const { mockD1, mockPg, mockStmt } = createMocks({
      existingCheckpoint: { lastD1Id: 500, status: 'SUCCESS' },
      d1Records: [],
    });
    const sync = new D1PostgresMeteringSync(mockD1, mockPg, { pipelineName: 'test-pipeline' });

    const checkpoint = await sync.getCheckpoint();
    expect(checkpoint.lastD1Id).toBe(500);

    await sync.reconcileBatch();
    expect(mockStmt.bind).toHaveBeenCalledWith(500, 100);
  });

  it('handles D1 fetch error gracefully without throwing', async () => {
    const { mockD1, mockPg } = createMocks({ d1Error: new Error('D1 Network Timeout') });
    const sync = new D1PostgresMeteringSync(mockD1, mockPg);

    const result = await sync.reconcileBatch();

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.errors[0]).toContain('D1 Network Timeout');
  });

  it('handles Postgres insertion error and marks checkpoint FAILED without corrupting id', async () => {
    const records: D1MetricRecord[] = [
      {
        id: 777,
        tenant_id: 't-fail',
        metric_name: 'api_calls',
        metric_value: 5,
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-01T01:00:00Z',
        recorded_at: '2026-10-01T00:10:00Z',
      },
    ];

    const { mockD1, mockPg, pgQueries } = createMocks({
      existingCheckpoint: { lastD1Id: 200, status: 'SUCCESS' },
      d1Records: records,
      pgErrorOnInsert: new Error('Postgres connection reset'),
    });

    const sync = new D1PostgresMeteringSync(mockD1, mockPg, { pipelineName: 'test-pipeline' });
    const result = await sync.reconcileBatch();

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.checkpoint).toBe(200);

    const failCheckpoint = pgQueries.find(
      (q) => q.text.includes('INSERT INTO metering_sync_checkpoints') && q.params?.includes('FAILED')
    );
    expect(failCheckpoint).toBeDefined();
    expect(failCheckpoint?.params?.[1]).toBe(200);
  });

  it('uses parameterized queries exclusively for all SQL operations', async () => {
    const records: D1MetricRecord[] = [
      {
        id: 99,
        tenant_id: "t-inject'; DROP TABLE test; --",
        metric_name: 'api_calls',
        metric_value: 1,
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-01T01:00:00Z',
        recorded_at: '2026-10-01T00:00:00Z',
      },
    ];

    const { mockD1, mockPg, pgQueries } = createMocks({ d1Records: records });
    const sync = new D1PostgresMeteringSync(mockD1, mockPg);
    await sync.reconcileBatch();

    for (const q of pgQueries) {
      expect(q.text).not.toContain("DROP TABLE");
      expect(q.params).toBeDefined();
    }
  });
});

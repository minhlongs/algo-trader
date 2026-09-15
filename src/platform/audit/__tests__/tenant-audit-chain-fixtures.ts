import { vi } from 'vitest';
import type { QueryResult, PoolClient } from 'pg';

export interface MockRow {
  id: string;
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: string;
  hash: string;
  previous_hash: string | null;
  created_at: Date;
}

export function createMockQueryHandler(mockRows: MockRow[]) {
  return async (sql: string, params?: unknown[]): Promise<QueryResult<MockRow>> => {
    if (sql.includes('ORDER BY sequence_number DESC')) {
      const tenantId = params?.[0] as string;
      const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
      if (tenantRows.length === 0) return { rows: [] } as unknown as QueryResult<MockRow>;
      const sorted = [...tenantRows].sort((a, b) => b.sequence_number - a.sequence_number);
      return { rows: [sorted[0]] } as unknown as QueryResult<MockRow>;
    }

    if (sql.includes('ORDER BY sequence_number ASC')) {
      const tenantId = params?.[0] as string;
      const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
      const sorted = [...tenantRows].sort((a, b) => a.sequence_number - b.sequence_number);
      return {
        rows: sorted.map(r => ({
          ...r,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
        })),
      } as unknown as QueryResult<MockRow>;
    }

    if (sql.includes('INSERT INTO tenant_audit_logs')) {
      const [tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at] = params || [];
      const newRow: MockRow = {
        id: `uuid-${Date.now()}-${Math.random()}`,
        tenant_id: tenant_id as string,
        sequence_number: Number(sequence_number),
        event_type: event_type as string,
        action_by: action_by as string,
        reason: reason as string | null,
        metadata: metadata as string,
        hash: hash as string,
        previous_hash: previous_hash === undefined ? null : (previous_hash as string | null),
        created_at: created_at as Date,
      };
      mockRows.push(newRow);
      return { rows: [newRow] } as unknown as QueryResult<MockRow>;
    }

    return { rows: [] } as unknown as QueryResult<MockRow>;
  };
}

export function createMockTransactionHandler(mockRows: MockRow[], fixedTimestamp: Date) {
  return async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('ORDER BY sequence_number DESC')) {
          const tenantId = params?.[0] as string;
          const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
          if (tenantRows.length === 0) return { rows: [] } as unknown as QueryResult<MockRow>;
          const sorted = [...tenantRows].sort((a, b) => b.sequence_number - a.sequence_number);
          return { rows: [sorted[0]] } as unknown as QueryResult<MockRow>;
        }
        if (sql.includes('INSERT INTO tenant_audit_logs')) {
          const [tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash] = params || [];
          const newRow: MockRow = {
            id: `uuid-${Date.now()}-${Math.random()}`,
            tenant_id: tenant_id as string,
            sequence_number: Number(sequence_number),
            event_type: event_type as string,
            action_by: action_by as string,
            reason: reason as string | null,
            metadata: metadata as string,
            hash: hash as string,
            previous_hash: previous_hash === undefined ? null : (previous_hash as string | null),
            created_at: fixedTimestamp,
          };
          mockRows.push(newRow);
          return { rows: [newRow] } as unknown as QueryResult<MockRow>;
        }
        return { rows: [] } as unknown as QueryResult<MockRow>;
      }),
    };
    return fn(mockClient as unknown as PoolClient);
  };
}

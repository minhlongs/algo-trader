import { describe, it, expect, beforeEach } from 'vitest';
import { QueryResult, PoolClient } from 'pg';

// 1. Mock external/local dependencies first
vi.mock('../../../db/postgres-client', () => {
  const mockClientInstance = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClientInstance),
    query: vi.fn(),
  };
  return {
    query: vi.fn(),
    getDbClient: () => mockPool,
  };
});

vi.mock('../../../billing/license-service', () => {
  return {
    LicenseService: {
      getInstance: () => ({
        getLicense: vi.fn((id: string) => {
          if (id === 'lic-existing') {
            return { id: 'lic-existing', status: 'active', tier: 'pro' };
          }
          return undefined;
        })
      })
    }
  };
});

vi.mock('../../../audit/audit-log-service', () => {
  return {
    AuditLogService: {
      getInstance: () => ({
        getLogsByLicense: vi.fn((licenseId: string) => {
          if (licenseId === 'lic-existing') {
            return [
              { id: 'log-1', licenseId, event: 'activated', createdAt: new Date().toISOString() }
            ];
          }
          return [];
        })
      })
    }
  };
});

vi.mock('pg-query-stream', () => {
  class SimpleEventEmitter {
    private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    public on(event: string, fn: (...args: unknown[]) => void): this {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
      return this;
    }
    public emit(event: string, ...args: unknown[]): boolean {
      const list = this.listeners[event] || [];
      for (const fn of list) {
        fn(...args);
      }
      return list.length > 0;
    }
  }

  class MockQueryStream extends SimpleEventEmitter {
    constructor(public sql: string, public params?: unknown[]) {
      super();
    }
  }
  return {
    default: MockQueryStream
  };
});

// 2. Import express and local application code after registering mocks
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { auditRouter } from '../audit-routes';
import { query, getDbClient } from '../../../db/postgres-client';

interface FakeClaims {
  sub?: string;
  role?: string;
}

interface DbMockRow {
  id: string;
  tenant_id: string;
  sequence_number: string;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: string;
  hash: string;
  previous_hash: string | null;
  created_at: string;
}

const mockDbRows: DbMockRow[] = [];

function buildApp(claims?: FakeClaims) {
  const app = express();
  app.use(express.json());
  app.use((req: Request & { claims?: FakeClaims }, _res: Response, next: NextFunction) => {
    if (claims) {
      req.claims = claims;
    }
    next();
  });
  app.use('/', auditRouter);
  return app;
}

describe('Audit Routes API', () => {
  beforeEach(async () => {
    mockDbRows.length = 0;

    // Add logs for tenant-1
    for (let i = 1; i <= 5; i++) {
      mockDbRows.push({
        id: `uuid-t1-${i}`,
        tenant_id: 'tenant-1',
        sequence_number: String(i),
        event_type: `event_type_${i}`,
        action_by: 'system',
        reason: `Reason ${i}`,
        metadata: JSON.stringify({ index: i }),
        hash: `hash-t1-${i}`,
        previous_hash: i === 1 ? null : `hash-t1-${i - 1}`,
        created_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      });
    }

    // Add logs for tenant-2
    for (let i = 1; i <= 3; i++) {
      mockDbRows.push({
        id: `uuid-t2-${i}`,
        tenant_id: 'tenant-2',
        sequence_number: String(i),
        event_type: `event_type_${i}`,
        action_by: 'system',
        reason: `Reason ${i}`,
        metadata: JSON.stringify({ index: i }),
        hash: `hash-t2-${i}`,
        previous_hash: i === 1 ? null : `hash-t2-${i - 1}`,
        created_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      });
    }

    // Mock query logic
    vi.mocked(query).mockImplementation(async (sql: string, params?: unknown[]) => {
      let filtered = [...mockDbRows];

      const getParamIndex = (pattern: string): number => {
        const match = sql.match(new RegExp(`${pattern}\\s*\\$(\\d+)`));
        if (match) return parseInt(match[1], 10) - 1;
        return -1;
      };

      const tenantIdx = getParamIndex('tenant_id\\s*=');
      if (tenantIdx !== -1 && params) {
        const tenantId = params[tenantIdx] as string;
        filtered = filtered.filter(r => r.tenant_id === tenantId);
      }

      const eventTypeIdx = getParamIndex('event_type\\s*=');
      if (eventTypeIdx !== -1 && params) {
        const eventType = params[eventTypeIdx] as string;
        filtered = filtered.filter(r => r.event_type === eventType);
      }

      const startIdx = getParamIndex('created_at\\s*>=');
      if (startIdx !== -1 && params) {
        const start = params[startIdx] as string;
        filtered = filtered.filter(r => r.created_at >= start);
      }

      const endIdx = getParamIndex('created_at\\s*<=');
      if (endIdx !== -1 && params) {
        const end = params[endIdx] as string;
        filtered = filtered.filter(r => r.created_at <= end);
      }

      const seqIdx = getParamIndex('sequence_number\\s*<');
      if (seqIdx !== -1 && params) {
        const seq = params[seqIdx] as number;
        filtered = filtered.filter(r => parseInt(r.sequence_number, 10) < seq);
      }

      const tupleMatch = sql.match(/\(created_at,\s*id\)\s*<\s*\(\$(\d+),\s*\$(\d+)\)/);
      if (tupleMatch && params) {
        const createdIdx = parseInt(tupleMatch[1], 10) - 1;
        const idIdx = parseInt(tupleMatch[2], 10) - 1;
        const cursorCreated = params[createdIdx] as string;
        const cursorId = params[idIdx] as string;
        filtered = filtered.filter(r => {
          if (r.created_at < cursorCreated) return true;
          if (r.created_at === cursorCreated && r.id < cursorId) return true;
          return false;
        });
      }

      if (sql.includes('ORDER BY sequence_number DESC')) {
        filtered.sort((a, b) => parseInt(b.sequence_number, 10) - parseInt(a.sequence_number, 10));
      } else {
        filtered.sort((a, b) => {
          if (b.created_at !== a.created_at) {
            return b.created_at.localeCompare(a.created_at);
          }
          return b.id.localeCompare(a.id);
        });
      }

      if (params && params.length > 0) {
        const limitMatch = sql.match(/LIMIT\s*\$(\d+)/);
        if (limitMatch) {
          const limitIdx = parseInt(limitMatch[1], 10) - 1;
          const limit = params[limitIdx] as number;
          filtered = filtered.slice(0, limit);
        }
      }

      return { rows: filtered } as unknown as QueryResult<DbMockRow>;
    });

    // Mock queryStream execution logic
    const pool = getDbClient();
    const mockClient = await pool.connect();
    
    vi.mocked(mockClient.query).mockImplementation((streamObj: unknown) => {
      const qStream = streamObj as EventEmitter & { sql: string; params?: unknown[] };
      setImmediate(() => {
        let filtered = [...mockDbRows];
        const params = qStream.params;
        const sql = qStream.sql;

        const getParamIndex = (pattern: string): number => {
          const match = sql.match(new RegExp(`${pattern}\\s*\\$(\\d+)`));
          if (match) return parseInt(match[1], 10) - 1;
          return -1;
        };

        const tenantIdx = getParamIndex('tenant_id\\s*=');
        if (tenantIdx !== -1 && params) {
          const tenantId = (params as unknown[])[tenantIdx] as string;
          filtered = filtered.filter(r => r.tenant_id === tenantId);
        }

        const eventTypeIdx = getParamIndex('event_type\\s*=');
        if (eventTypeIdx !== -1 && params) {
          const eventType = (params as unknown[])[eventTypeIdx] as string;
          filtered = filtered.filter(r => r.event_type === eventType);
        }

        if (sql.includes('ORDER BY sequence_number DESC')) {
          filtered.sort((a, b) => parseInt(b.sequence_number, 10) - parseInt(a.sequence_number, 10));
        } else {
          filtered.sort((a, b) => {
            if (b.created_at !== a.created_at) {
              return b.created_at.localeCompare(a.created_at);
            }
            return b.id.localeCompare(a.id);
          });
        }

        for (const row of filtered) {
          qStream.emit('data', row);
        }
        qStream.emit('end');
      });

      return qStream as unknown as Promise<QueryResult<unknown>>;
    });
  });

  describe('GET /logs', () => {
    it('returns 403 when no tenant identity is provided', async () => {
      const app = buildApp();
      const res = await request(app).get('/logs');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('TenantIsolator');
    });

    it('returns 403 when requesting cross-tenant logs as non-admin', async () => {
      const app = buildApp({ sub: 'tenant-1', role: 'user' });
      const res = await request(app).get('/logs?tenantId=tenant-2');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('cross-tenant access denied');
    });

    it('returns 200 with tenant logs for matching tenant', async () => {
      const app = buildApp({ sub: 'tenant-1', role: 'user' });
      const res = await request(app).get('/logs');
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(5);
      expect(res.body.logs[0].tenant_id).toBe('tenant-1');
      expect(res.body.logs[0].sequence_number).toBe(5);
    });

    it('returns 200 with tenant logs for admin querying any tenant', async () => {
      const app = buildApp({ sub: 'admin-user', role: 'admin' });
      const res = await request(app).get('/logs?tenantId=tenant-2');
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(3);
      expect(res.body.logs[0].tenant_id).toBe('tenant-2');
    });

    it('supports keyset pagination using limit and cursorSeq', async () => {
      const app = buildApp({ sub: 'tenant-1', role: 'user' });
      // Get first 2 logs
      const res1 = await request(app).get('/logs?limit=2');
      expect(res1.status).toBe(200);
      expect(res1.body.logs.length).toBe(2);
      expect(res1.body.logs[0].sequence_number).toBe(5);
      expect(res1.body.logs[1].sequence_number).toBe(4);
      expect(res1.body.nextCursor).toEqual({ cursorSeq: 4 });

      // Fetch next logs using cursorSeq
      const res2 = await request(app).get('/logs?limit=2&cursorSeq=4');
      expect(res2.status).toBe(200);
      expect(res2.body.logs.length).toBe(2);
      expect(res2.body.logs[0].sequence_number).toBe(3);
      expect(res2.body.logs[1].sequence_number).toBe(2);
    });
  });

  describe('GET /export', () => {
    it('returns 403 when requesting cross-tenant export as non-admin', async () => {
      const app = buildApp({ sub: 'tenant-1', role: 'user' });
      const res = await request(app).get('/export?tenantId=tenant-2');
      expect(res.status).toBe(403);
    });

    it('exports tenant logs in JSON format', async () => {
      const app = buildApp({ sub: 'tenant-2', role: 'user' });
      const res = await request(app).get('/export?format=json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const data = JSON.parse(res.text);
      expect(data.length).toBe(3);
      expect(data[0].tenant_id).toBe('tenant-2');
    });

    it('exports tenant logs in CSV format', async () => {
      const app = buildApp({ sub: 'tenant-2', role: 'user' });
      const res = await request(app).get('/export?format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBe(4); // Header + 3 rows
      expect(lines[0]).toBe('id,tenant_id,sequence_number,event_type,action_by,reason,metadata,hash,previous_hash,created_at');
      expect(lines[1]).toContain('tenant-2');
    });
  });

  describe('GET /license/:id/audit', () => {
    it('returns 404 if license does not exist', async () => {
      const app = buildApp({ role: 'admin' });
      const res = await request(app).get('/license/lic-nonexistent/audit');
      expect(res.status).toBe(404);
    });

    it('returns 200 with logs if license exists', async () => {
      const app = buildApp({ role: 'admin' });
      const res = await request(app).get('/license/lic-existing/audit');
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(1);
      expect(res.body.logs[0].event).toBe('activated');
    });
  });
});

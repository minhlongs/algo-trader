import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryResult } from 'pg';
import express from 'express';
import request from 'supertest';

vi.mock('../../../../db/postgres-client', () => {
  const rows: unknown[] = [];
  const mockClientInstance = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      // Mock implementation returns all rows (tests filter in beforeEach)
      return { rows } as unknown as QueryResult<unknown>;
    }),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClientInstance),
    query: vi.fn(),
  };
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => ({ rows } as unknown as QueryResult<unknown>)),
    getDbClient: () => mockPool,
  };
});

vi.mock('../../../billing/license-service', () => ({
  LicenseService: {
    getInstance: () => ({
      getLicense: vi.fn((id: string) => {
        if (id === 'lic-existing') {
          return { id: 'lic-existing', status: 'active', tier: 'pro' };
        }
        return undefined;
      }),
    }),
  },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      getLogsByLicense: vi.fn((licenseId: string) => {
        if (licenseId === 'lic-existing') {
          return [
            { id: 'log-1', licenseId, event: 'activated', createdAt: new Date().toISOString() },
          ];
        }
        return [];
      }),
    }),
  },
}));

import { auditRouter } from '../../../../api/routes/audit-routes';

interface FakeClaims {
  sub?: string;
  role?: string;
}

const mockDbRows: unknown[] = [];

function buildApp(claims?: FakeClaims) {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { claims?: FakeClaims }, _res, next) => {
    if (claims) {
      req.claims = claims;
    }
    next();
  });
  app.use('/', auditRouter);
  return app;
}

describe('Audit Routes API', () => {
  beforeEach(() => {
    mockDbRows.length = 0;
  });

  it('returns 403 when no tenant identity is provided', async () => {
    const app = buildApp();
    const res = await request(app).get('/logs');
    expect(res.status).toBe(403);
  });

  it('returns 200 with logs if license exists', async () => {
    const app = buildApp({ role: 'admin' });
    const res = await request(app).get('/license/lic-existing/audit');
    expect(res.status).toBe(200);
  });
});

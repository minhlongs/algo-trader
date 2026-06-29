import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import { registerAuditRoutes } from '../audit-routes';
import { AuditLogService, AuditLogFilters, AuditEventType } from '../../../audit/audit-log-service';
import { LicenseService } from '../../../billing/license-service';

// ---------------------------------------------------------------------------
// Shared mock instances — routes call getInstance() at registration time,
// so we must return the SAME object that tests configure.
// ---------------------------------------------------------------------------

const mockAuditLogs = new Map<string, {
  id: string; licenseId: string; event: AuditEventType; tier?: string;
  ip?: string; metadata?: Record<string, unknown>; createdAt: string;
}>();

const mockLicenseLogs = new Map<string, {
  id: string; licenseId: string; event: AuditEventType; createdAt: string;
}[]>();

const mockAuditInstance = {
  getAllLogs: vi.fn(),
  getLogsByLicense: vi.fn(),
  exportToCsv: vi.fn(),
  exportToJson: vi.fn(),
};

const mockLicenseInstance = {
  getLicense: vi.fn(),
};

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => mockAuditInstance,
  },
  AuditEventType: 'created' as const,
}));

vi.mock('../../../billing/license-service', () => ({
  LicenseService: {
    getInstance: () => mockLicenseInstance,
  },
}));

vi.mock('pg-query-stream', () => {
  class SimpleEventEmitter {
    private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    on(event: string, fn: (...args: unknown[]) => void): this {
      (this.listeners[event] ??= []).push(fn);
      return this;
    }
    emit(event: string, ...args: unknown[]): boolean {
      (this.listeners[event] ?? []).forEach((fn) => fn(...args));
      return (this.listeners[event]?.length ?? 0) > 0;
    }
  }
  class MockQueryStream extends SimpleEventEmitter {
    constructor(public sql: string, public params?: unknown[]) { super(); }
  }
  return { default: MockQueryStream };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AuditLogRow {
  id: string;
  licenseId: string;
  event: AuditEventType;
  tier?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

function buildServer(): FastifyInstance {
  const server = fastify();
  registerAuditRoutes(server);
  return server;
}

function seedLogs(rows: AuditLogRow[]): void {
  mockAuditLogs.clear();
  mockLicenseLogs.clear();
  for (const row of rows) {
    mockAuditLogs.set(row.id, { ...row });
    const key = row.licenseId;
    const existing = mockLicenseLogs.get(key) ?? [];
    existing.push({ id: row.id, licenseId: row.licenseId, event: row.event, createdAt: row.createdAt });
    mockLicenseLogs.set(key, existing);
  }
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockAuditLogs.clear();
  mockLicenseLogs.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Audit Routes API', () => {
  beforeEach(() => {
    resetMocks();
    mockAuditInstance.getAllLogs.mockImplementation(async (filters: AuditLogFilters) => {
      let all = Array.from(mockAuditLogs.values());
      if (filters.licenseId) {
        all = all.filter((l) => l.licenseId === filters.licenseId);
      }
      return all;
    });
    mockAuditInstance.getLogsByLicense.mockImplementation(async (licenseId: string) => {
      return mockLicenseLogs.get(licenseId) ?? [];
    });
    mockAuditInstance.exportToJson.mockImplementation((logs: AuditLogRow[]) => JSON.stringify(logs));
    mockAuditInstance.exportToCsv.mockImplementation((_logs: AuditLogRow[]) =>
      'id,licenseId,event,tier,ip,metadata,createdAt\n'
    );
    mockLicenseInstance.getLicense.mockImplementation((id: string) =>
      id === 'lic-existing' ? { id: 'lic-existing', status: 'active', tier: 'pro' } : undefined
    );
  });

  // -------------------------------------------------------------------------
  // GET /logs
  // -------------------------------------------------------------------------

  describe('GET /logs', () => {
    it('returns 200 with all logs when no filters provided', async () => {
      seedLogs([
        { id: 'log-1', licenseId: 'lic-1', event: 'activated', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'log-2', licenseId: 'lic-2', event: 'created', createdAt: '2025-01-02T00:00:00Z' },
      ]);

      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/logs' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.logs).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.hasMore).toBe(false);
    });

    it('filters logs by licenseId', async () => {
      seedLogs([
        { id: 'log-1', licenseId: 'lic-a', event: 'activated', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'log-2', licenseId: 'lic-b', event: 'created', createdAt: '2025-01-02T00:00:00Z' },
      ]);

      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/logs?licenseId=lic-a' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].licenseId).toBe('lic-a');
    });

    it('returns 501 for GET /logs/:id (not implemented)', async () => {
      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/logs/some-id' });

      expect(res.statusCode).toBe(501);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Not Implemented');
    });
  });

  // -------------------------------------------------------------------------
  // GET /export
  // -------------------------------------------------------------------------

  describe('GET /export', () => {
    it('returns JSON export with correct content-type', async () => {
      seedLogs([
        { id: 'log-1', licenseId: 'lic-1', event: 'activated', createdAt: '2025-01-01T00:00:00Z' },
      ]);

      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/export?format=json' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toMatch(/audit-logs-.*\.json/);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
    });

    it('returns CSV export with correct content-type', async () => {
      seedLogs([
        { id: 'log-1', licenseId: 'lic-1', event: 'activated', createdAt: '2025-01-01T00:00:00Z' },
      ]);

      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/export?format=csv' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/audit-logs-.*\.csv/);
      expect(res.payload).toContain('id,licenseId,event,tier,ip,metadata,createdAt');
    });
  });

  // -------------------------------------------------------------------------
  // GET /license/:id/audit
  // -------------------------------------------------------------------------

  describe('GET /license/:id/audit', () => {
    it('returns 404 when license does not exist', async () => {
      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/license/lic-nonexistent/audit' });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Not Found');
    });

    it('returns 200 with logs when license exists', async () => {
      seedLogs([
        { id: 'log-1', licenseId: 'lic-existing', event: 'activated', createdAt: '2025-01-01T00:00:00Z' },
      ]);

      const server = buildServer();
      const res = await server.inject({ method: 'GET', url: '/license/lic-existing/audit' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].event).toBe('activated');
    });
  });
});

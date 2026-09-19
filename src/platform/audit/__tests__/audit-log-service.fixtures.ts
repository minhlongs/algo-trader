/**
 * Shared fixtures and database mocks for AuditLogService tests.
 */
import { vi } from "vitest";

export interface MockAuditRow {
  id?: string;
  licenseId?: string;
  event?: string;
  tier?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
  createdAt?: string;
}

export const MOCK_DB: MockAuditRow[] = [];

export function resetMockDb() {
  MOCK_DB.length = 0;
}

export function mockQueryImpl(sql: string, params?: string[]) {
  const s = String(sql);
  if (s.includes("FROM audit_log")) {
    if (s.includes("WHERE tenant_id")) {
      const tenantId = String(params?.[0] ?? "");
      const tenantRows = MOCK_DB.filter((r) => r.tenantId === tenantId);
      return { rows: tenantRows };
    }
    const limit = Number(params?.[0] ?? 100);
    return { rows: MOCK_DB.slice(0, limit) };
  }
  if (s.includes("COUNT(*)") || s.includes("SELECT id FROM audit_log")) {
    return { rows: [{ cnt: MOCK_DB.length }], rowCount: MOCK_DB.length };
  }
  if (s.includes("DELETE FROM audit_log")) {
    const before = MOCK_DB.length;
    MOCK_DB.length = 0;
    return { rows: [], rowCount: before };
  }
  return { rows: [] };
}

export function mockLogAuditImpl(entry: MockAuditRow) {
  MOCK_DB.push(entry);
  return Promise.resolve();
}

export function mockGetAuditTrailImpl(_resource: string, limit = 100) {
  return Promise.resolve(MOCK_DB.slice(0, limit));
}

export function mockGetAuditTrailByTenantImpl(tenantId: string, limit = 100) {
  return Promise.resolve(MOCK_DB.filter((r) => r.tenantId === tenantId).slice(0, limit));
}

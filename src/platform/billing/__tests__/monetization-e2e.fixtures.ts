/**
 * Monetization E2E Fixtures
 *
 * An in-memory table router over `pg.Pool`, plus the shared mock captures the
 * monetization end-to-end suite needs.
 *
 * The point of this suite is to exercise the real tier-resolution and payout-split
 * code, so the boundary mocked here is the database pool and the outbound provider
 * call — never the tier logic or the meter.
 */

import { vi, type Mock } from 'vitest';

export interface Row {
  [key: string]: unknown;
}

/** Tables the marketplace repositories, revenue ledger, and audit writer touch. */
const TABLES = [
  'marketplace_subscriptions',
  'marketplace_revenue_shares',
  'marketplace_listings',
  'marketplace_strategies',
  'audit_log',
] as const;

export const db = (() => {
  const tables = new Map<string, Row[]>();

  function table(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name) as Row[];
  }

  return {
    table,
    tableNames: TABLES,
    reset(): void {
      tables.clear();
    },
    async query(sql: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const lower = sql.toLowerCase();
      const name = TABLES.find((t) => lower.includes(t)) ?? null;
      if (name === null) return { rows: [], rowCount: 0 };
      const rows = table(name);
      const where = /where ([a-z_]+) = \$(\d+)/i.exec(sql);
      if (where) {
        const value = (params as Row[])[Number(where[2]) - 1];
        return { rows: rows.filter((r) => r[where[1]] === value), rowCount: rows.length };
      }
      return { rows: [...rows], rowCount: rows.length };
    },
  };
})();

/** Logger capture — the handler writes an audit-style entry when a tier is refused. */
export const mockLogger: {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
} = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

/** Signal subscription storage capture (the durable repo is swapped for spies). */
export const mockSignalRepo: {
  getBySubscriberId: Mock;
  upsert: Mock;
  setActive: Mock;
} = {
  getBySubscriberId: vi.fn(),
  upsert: vi.fn(),
  setActive: vi.fn(),
};

/** Outbound provider capture — HTTP only; nothing ever reaches real NOWPayments. */
export const fetchMock: Mock = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: class {
      async query(s: string, p?: unknown[]) {
        return db.query(s, p);
      }
      on() {
        return this;
      }
    },
  },
}));

vi.mock('../../signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: mockSignalRepo,
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

vi.stubGlobal('fetch', fetchMock);

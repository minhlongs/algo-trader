/**
 * Monetization E2E Fixtures
 *
 * An in-memory table router over `pg.Pool`, plus the shared mock captures the
 * monetization end-to-end suite needs.
 *
 * The point of this suite is to exercise the real tier-resolution and payout-split
 * code, so the boundary mocked here is the database pool and the outbound provider
 * call — never the tier logic or the meter.
 *
 * The captures are plain module state, not `vi.hoisted`: a `vi.mock` factory is
 * only invoked the first time its target module is imported, which is always
 * after this module body has run (nothing here imports `pg`). Vitest also refuses
 * to export a hoisted variable, so hoisting would break the import below.
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

  function tableFor(sql: string): string | null {
    const lower = sql.toLowerCase();
    for (const name of [
      'marketplace_subscriptions',
      'marketplace_revenue_shares',
      'marketplace_listings',
      'marketplace_strategies',
      'audit_log',
    ]) {
      if (lower.includes(name)) return name;
    }
    return null;
  }

  return {
    table,
    tableNames: TABLES,
    reset(): void {
      tables.clear();
    },
    async query(sql: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const lower = sql.toLowerCase().trim();
      const name = tableFor(sql);
      if (name === null) return { rows: [], rowCount: 0 };
      const rows = table(name);

      if (lower.startsWith('insert')) {
        // Map positional params onto the declared column list.
        const columns = /insert into \w+ \(([^)]+)\)/i.exec(sql)?.[1].split(',').map((c) => c.trim());
        if (!columns) return { rows: [], rowCount: 0 };
        const row: Row = {};
        columns.forEach((col, i) => {
          row[col] = (params as Row[])[i] ?? null;
        });
        rows.push(row);
        const returning = /returning \*/i.test(sql);
        return { rows: returning ? [row] : [], rowCount: 1 };
      }

      if (lower.startsWith('update')) {
        const setMatch = /set (.+?) where/i.exec(sql);
        const idParam = (params as unknown[])[(params as unknown[]).length - 1];
        const target = rows.find((r) => r.id === idParam);
        if (!target || !setMatch) return { rows: [], rowCount: 0 };
        let nextParam = 0;
        for (const assignment of setMatch[1].split(',').map((s) => s.trim())) {
          const col = assignment.split('=')[0].trim();
          const placeholder = /\$(\d+)/.exec(assignment);
          if (placeholder) {
            target[col] = (params as Row[])[Number(placeholder[1]) - 1];
            nextParam = Number(placeholder[1]);
          } else if (assignment.includes('now()')) {
            target[col] = new Date().toISOString();
          } else if (nextParam < (params as unknown[]).length) {
            nextParam += 1;
            target[col] = (params as Row[])[nextParam - 1];
          }
        }
        return { rows: [target], rowCount: 1 };
      }

      if (lower.startsWith('select count(*)')) {
        return { rows: [{ total: String(rows.length) }], rowCount: 1 };
      }

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
      async connect() {
        return this;
      }
      async end() {}
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

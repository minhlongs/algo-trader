import { vi } from 'vitest';

export const store = new Map<string, Record<string, unknown>>();

export function resetStore() {
  store.clear();
}

vi.mock('pg', () => ({
  default: {
    Pool: class {
      async query(_sql: string, vals?: unknown[]) {
        const s = typeof _sql === 'string' ? _sql.toLowerCase() : '';
        const id = vals?.[0] as string | undefined;
        if (s.includes('on conflict')) {
          const row: Record<string, unknown> = {};
          vals?.forEach((v, i) => { row[`_v${i}`] = v; });
          if (id) store.set(id, row);
          return { rows: [row], rowCount: 1, oid: 0, command: 'INSERT' };
        }
        const row = id ? store.get(id) : undefined;
        if (!row) return { rows: [], rowCount: 0, oid: 0, command: 'SELECT' };
        return { rows: [row], rowCount: 1, oid: 0, command: 'SELECT' };
      }
      async connect() { return this; }
      async end() {}
      on(_event: string, _handler: (...args: unknown[]) => void) { return this; }
    },
  },
}));

export function setupPgMock() {
  // Mocks are hoisted above; callers may invoke for symmetry.
}

/**
 * Tests for the usage_metrics migration.
 *
 * The bug this guards against is invisible to an "was up() called" test: the
 * service INSERTed into a table no migration created, the error was swallowed,
 * and the quota gate reported budget remaining forever. So these tests parse
 * the actual SQL the migration issues and assert the table has the exact
 * column set and constraint the service depends on.
 */

import { describe, it, expect } from 'vitest';
import * as migration from '../migrations/057-add-usage-metrics-table';

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

/** Records every statement the module issues, in order. */
function recorder(): { statements: CapturedQuery[]; client: unknown } {
  const statements: CapturedQuery[] = [];
  const client = {
    query: (sql: string, params?: unknown[]) => {
      // Normalise whitespace so the column list is stable enough to parse.
      statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  return { statements, client };
}

/** Extract the column declarations from a CREATE TABLE statement. */
function columnsOf(createSql: string): string[] {
  const body = createSql.slice(
    createSql.indexOf('(') + 1,
    createSql.lastIndexOf(')'),
  );
  return body
    .split(',')
    .map((part) => part.trim())
    .filter((part) => !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(part))
    .map((part) => part.split(/\s+/)[0]!);
}

describe('057-add-usage-metrics-table', () => {
  it('has an id and description matching its filename prefix', () => {
    expect(migration.id).toBe('057-add-usage-metrics-table');
    expect(migration.description.length).toBeGreaterThan(10);
  });

  it('creates the usage_metrics table', async () => {
    const { statements, client } = recorder();
    await migration.up(client as unknown as Parameters<typeof migration.up>[0]);
    const create = statements.map((s) => s.sql).find((s) => s.startsWith('CREATE TABLE'));
    expect(create).toBeDefined();
    expect(create).toContain('usage_metrics');
  });

  it('is idempotent so re-running against an existing table is safe', async () => {
    const { statements, client } = recorder();
    await migration.up(client as unknown as Parameters<typeof migration.up>[0]);
    const create = statements.map((s) => s.sql).find((s) => s.startsWith('CREATE TABLE'));
    expect(create).toContain('IF NOT EXISTS');
  });

  it('creates every column the service selects and inserts', async () => {
    const { statements, client } = recorder();
    await migration.up(client as unknown as Parameters<typeof migration.up>[0]);
    const create = statements.map((s) => s.sql).find((s) => s.startsWith('CREATE TABLE'))!;
    const cols = columnsOf(create);
    // Columns read by getSnapshot / getPeriodUsage and written by recordCall
    // or recordTrade.
    for (const col of [
      'id',
      'subscriber_id',
      'period',
      'calls_today',
      'calls_this_period',
      'trades_this_period',
      'trade_volume',
      'period_limit',
      'overage_calls',
      'last_reset_at',
      'updated_at',
    ]) {
      expect(cols, `missing column ${col}`).toContain(col);
    }
  });

  it('declares the unique pair the ON CONFLICT clause targets', async () => {
    const { statements, client } = recorder();
    await migration.up(client as unknown as Parameters<typeof migration.up>[0]);
    const all = statements.map((s) => s.sql).join('\n');
    // recordCall relies on ON CONFLICT (subscriber_id, period); without this
    // the upsert raises and the swallowed error hides the whole quota path.
    expect(all).toMatch(/UNIQUE\s*\(\s*subscriber_id\s*,\s*period\s*\)/);
  });

  it('indexes the subscriber + period lookup the gate performs per request', async () => {
    const { statements, client } = recorder();
    await migration.up(client as unknown as Parameters<typeof migration.up>[0]);
    const all = statements.map((s) => s.sql).join('\n');
    expect(all).toMatch(/idx_usage_metrics_subscriber_period/);
    expect(all).toMatch(/idx_usage_metrics_period/);
  });

  it('backs out cleanly, dropping indexes before the table', async () => {
    const { statements, client } = recorder();
    await migration.down(client as unknown as Parameters<typeof migration.down>[0]);
    const drops = statements.map((s) => s.sql);
    const tableIdx = drops.findIndex((s) => s.includes('DROP TABLE IF EXISTS usage_metrics'));
    const lastIndexIdx = drops
      .map((s, i) => (s.includes('DROP INDEX') ? i : -1))
      .filter((i) => i >= 0)
      .pop();
    expect(tableIdx).toBeGreaterThan(-1);
    expect(lastIndexIdx).toBeLessThan(tableIdx);
  });
});

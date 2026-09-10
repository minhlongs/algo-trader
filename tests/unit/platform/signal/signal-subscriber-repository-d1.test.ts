/**
 * Tests for signal-subscriber-repository-d1 — mocks postgres-client.query and
 * logger so every method (ensureTable, getBySubscriberId, upsert,
 * setActive, getActiveSubscriptions, countActive, webhook CRUD) is exercised
 * without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockQuery } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQuery: vi.fn(),
}));

vi.mock('../../../../src/db/postgres-client', () => ({
  query: mockQuery,
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

type Mod = typeof import('../../../../src/platform/signal/signal-subscriber-repository-d1');
let mod: Mod;
let repo: Mod['SignalSubscriberRepositoryD1'];

beforeEach(async () => {
  vi.clearAllMocks();
  // mockReset clears the mockResolvedValueOnce queue too (mockClear does not),
  // otherwise once-values queued by a previous test leak into the next.
  mockQuery.mockReset();
  vi.resetModules();
  mod = await import('../../../../src/platform/signal/signal-subscriber-repository-d1');
  repo = new mod.SignalSubscriberRepositoryD1();
  // ensureTable() runs on first use of each method and issues 4 DDL queries
  // (1 CREATE TABLE subscriptions, 2 CREATE INDEX, 1 CREATE TABLE webhooks).
  // Queue 4 empty results ahead of any mockResolvedValueOnce the test adds.
  for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce({ rows: [] });
  // Silence the "Tables ensured" log by default; tests can override.
  mockLogger.info.mockImplementation(() => {});
});

const row = {
  id: 's1',
  subscriber_id: 'sub-1',
  chat_id: 42,
  tier: 'PRO',
  active: true,
  created_at: 1,
  updated_at: 2,
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ensureTable', () => {
  it('is idempotent — runs CREATE statements once and logs', async () => {
    for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.ensureTable();
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockLogger.info).toHaveBeenCalledWith('[SignalSubscriberRepo] Tables ensured');
    // Second call short-circuits via the cached flag.
    await repo.ensureTable();
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('runs CREATE TABLE + two CREATE INDEX + CREATE TABLE webhooks', async () => {
    for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.ensureTable();
    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS signal_subscriptions'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE INDEX IF NOT EXISTS idx_signal_subs_subscriber'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE INDEX IF NOT EXISTS idx_signal_subs_active'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS signal_webhooks'))).toBe(true);
  });
});

describe('getBySubscriberId', () => {
  it('returns the mapped subscription when a row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const sub = await repo.getBySubscriberId('sub-1');
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
      ['sub-1'],
    );
    expect(sub).toEqual({
      id: 's1',
      subscriberId: 'sub-1',
      chatId: 42,
      tier: 'PRO',
      active: true,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('returns undefined when no row matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const sub = await repo.getBySubscriberId('missing');
    expect(sub).toBeUndefined();
  });

  it('maps null chat_id to undefined', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...row, chat_id: null }] });
    const sub = await repo.getBySubscriberId('sub-1');
    expect(sub?.chatId).toBeUndefined();
  });
});

describe('upsert', () => {
  it('INSERTs with ON CONFLICT update', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repo.upsert({
      id: 's1',
      subscriberId: 'sub-1',
      chatId: 42,
      tier: 'FREE',
      active: true,
      createdAt: 1,
      updatedAt: 2,
    });
    const [sql, params] = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO signal_subscriptions'),
    )!;
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(params).toEqual(['s1', 'sub-1', 42, 'FREE', true, 1, expect.any(Number)]);
  });

  it('treats a missing chatId as null', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repo.upsert({
      id: 's1',
      subscriberId: 'sub-1',
      tier: 'FREE',
      active: true,
      createdAt: 1,
      updatedAt: 2,
    });
    const [, params] = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO signal_subscriptions'),
    )!;
    expect(params[2]).toBeNull();
  });
});

describe('setActive', () => {
  it('UPDATEs active flag and updated_at', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repo.setActive('sub-1', false);
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE signal_subscriptions SET active = $1, updated_at = $2 WHERE subscriber_id = $3',
      [false, expect.any(Number), 'sub-1'],
    );
  });
});

describe('getActiveSubscriptions', () => {
  it('maps every row through rowToSubscription', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row, { ...row, id: 's2', active: false }] });
    const subs = await repo.getActiveSubscriptions();
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM signal_subscriptions WHERE active = TRUE ORDER BY created_at',
    );
    expect(subs).toHaveLength(2);
    expect(subs[0]?.subscriberId).toBe('sub-1');
    expect(subs[1]?.id).toBe('s2');
  });

  it('returns an empty array when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repo.getActiveSubscriptions()).toEqual([]);
  });
});

describe('countActive', () => {
  it('parses the count column', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    expect(await repo.countActive()).toBe(7);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS count FROM signal_subscriptions WHERE active = TRUE',
    );
  });

  it('returns 0 when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repo.countActive()).toBe(0);
  });
});

describe('webhooks', () => {
  it('setWebhook INSERTs with ON CONFLICT update', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repo.setWebhook('sub-1', 'https://example.com/hook');
    expect(mockQuery).toHaveBeenCalledWith(
      'INSERT INTO signal_webhooks (subscriber_id, url) VALUES ($1, $2) ON CONFLICT (subscriber_id) DO UPDATE SET url = EXCLUDED.url',
      ['sub-1', 'https://example.com/hook'],
    );
  });

  it('getWebhook returns the url when present', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ url: 'https://example.com/hook' }] });
    expect(await repo.getWebhook('sub-1')).toBe('https://example.com/hook');
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT url FROM signal_webhooks WHERE subscriber_id = $1',
      ['sub-1'],
    );
  });

  it('getWebhook returns undefined when absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repo.getWebhook('missing')).toBeUndefined();
  });

  it('removeWebhook DELETEs the row', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repo.removeWebhook('sub-1');
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM signal_webhooks WHERE subscriber_id = $1',
      ['sub-1'],
    );
  });
});

describe('singleton export', () => {
  it('exports a SignalSubscriberRepositoryD1 instance', () => {
    expect(mod.signalSubscriberRepo).toBeInstanceOf(mod.SignalSubscriberRepositoryD1);
  });
});
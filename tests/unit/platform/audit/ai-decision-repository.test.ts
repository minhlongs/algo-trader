/**
 * Tests for AIDecisionRepository — mocks postgres-client.query so every CRUD
 * path, the filtered query/count builders, and both mappers are exercised
 * without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../../../src/shared/db/postgres-client', () => ({ query: mockQuery }));

type Mod = typeof import('../../../../src/platform/audit/ai-decision-repository');
let mod: Mod;

beforeEach(async () => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  vi.resetModules();
  mod = await import('../../../../src/platform/audit/ai-decision-repository');
});

const decisionRow = {
  id: 'dec-1',
  model_name: 'gpt-4',
  input_hash: 'abc123',
  output: JSON.stringify({ action: 'buy' }),
  confidence: '0.92',
  latency_ms: '120',
  created_at: '2026-01-01T00:00:00Z',
};

const metadataRow = {
  id: 'meta-1',
  decision_id: 'dec-1',
  key: 'source',
  value: 'cron',
  created_at: '2026-01-01T00:00:00Z',
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('recordDecision', () => {
  it('INSERTs and maps the RETURNING row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [decisionRow] });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.recordDecision({
      model_name: 'gpt-4',
      input_hash: 'abc123',
      output: { action: 'buy' },
      confidence: 0.92,
      latency_ms: 120,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_decisions'),
      ['gpt-4', 'abc123', JSON.stringify({ action: 'buy' }), 0.92, 120],
    );
    expect(out.id).toBe('dec-1');
    expect(out.model_name).toBe('gpt-4');
    expect(out.output).toEqual({ action: 'buy' });
    expect(out.confidence).toBeCloseTo(0.92, 5);
    expect(out.latency_ms).toBe(120);
  });

  it('JSON.stringifies an object output', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [decisionRow] });
    const repo = new mod.AIDecisionRepository();
    await repo.recordDecision({
      model_name: 'gpt-4',
      input_hash: 'h',
      output: { nested: { value: 1 }, list: [1, 2] },
      confidence: 0.5,
      latency_ms: 10,
    });
    const params = mockQuery.mock.calls[0][1];
    expect(JSON.parse(params[2] as string)).toEqual({ nested: { value: 1 }, list: [1, 2] });
  });
});

describe('recordMetadata', () => {
  it('INSERTs and maps the metadata row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [metadataRow] });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.recordMetadata('dec-1', 'source', 'cron');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_decision_metadata'),
      ['dec-1', 'source', 'cron'],
    );
    expect(out.id).toBe('meta-1');
    expect(out.decision_id).toBe('dec-1');
    expect(out.key).toBe('source');
    expect(out.value).toBe('cron');
  });
});

describe('getDecisions', () => {
  it('returns an empty array when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    expect(await repo.getDecisions()).toEqual([]);
  });

  it('maps every row through mapDecisionRow', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [decisionRow, { ...decisionRow, id: 'dec-2' }] });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.getDecisions();
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('dec-1');
    expect(out[1].id).toBe('dec-2');
  });

  it('appends model_name filter when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ model_name: 'gpt-4' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('model_name = $1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['gpt-4']);
  });

  it('appends date range filters in order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ start_date: '2026-01-01', end_date: '2026-02-01' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('created_at <= $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('appends confidence range filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ min_confidence: 0.5, max_confidence: 0.9 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('confidence >= $1');
    expect(sql).toContain('confidence <= $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([0.5, 0.9]);
  });

  it('combines all filters with correct param indices', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({
      model_name: 'gpt-4',
      start_date: '2026-01-01',
      end_date: '2026-02-01',
      min_confidence: 0.5,
      max_confidence: 0.9,
    });
    const params = mockQuery.mock.calls[0][1];
    expect(params).toEqual(['gpt-4', '2026-01-01', '2026-02-01', 0.5, 0.9]);
  });

  it('always orders by created_at DESC', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY created_at DESC');
  });

  it('appends LIMIT when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ limit: 10 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT $1');
    expect(mockQuery.mock.calls[0][1]).toEqual([10]);
  });

  it('appends OFFSET when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ offset: 20 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('OFFSET $1');
    expect(mockQuery.mock.calls[0][1]).toEqual([20]);
  });

  it('appends LIMIT and OFFSET together', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisions({ limit: 10, offset: 30 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT $1');
    expect(sql).toContain('OFFSET $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([10, 30]);
  });
});

describe('getDecisionWithMetadata', () => {
  it('returns null when no decision matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    expect(await repo.getDecisionWithMetadata('missing')).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns the decision with its metadata entries', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [decisionRow] })
      .mockResolvedValueOnce({ rows: [metadataRow, { ...metadataRow, id: 'meta-2' }] });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.getDecisionWithMetadata('dec-1');
    expect(out).not.toBeNull();
    expect(out!.id).toBe('dec-1');
    expect(out!.metadata).toHaveLength(2);
    expect(out!.metadata[0].key).toBe('source');
    expect(out!.metadata[1].id).toBe('meta-2');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns an empty metadata array when none exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [decisionRow] })
      .mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.getDecisionWithMetadata('dec-1');
    expect(out!.metadata).toEqual([]);
  });

  it('queries metadata ordered by key ASC', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [decisionRow] })
      .mockResolvedValueOnce({ rows: [] });
    const repo = new mod.AIDecisionRepository();
    await repo.getDecisionWithMetadata('dec-1');
    const metaSql = mockQuery.mock.calls[1][0] as string;
    expect(metaSql).toContain('ORDER BY key ASC');
  });
});

describe('countDecisions', () => {
  it('parses a numeric total', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 42 }] });
    const repo = new mod.AIDecisionRepository();
    expect(await repo.countDecisions()).toBe(42);
  });

  it('parses a string total', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '7' }] });
    const repo = new mod.AIDecisionRepository();
    expect(await repo.countDecisions()).toBe(7);
  });

  it('returns 0 when total is a non-numeric string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 'garbage' }] });
    const repo = new mod.AIDecisionRepository();
    expect(await repo.countDecisions()).toBe(0);
  });

  it('applies the same filters as getDecisions (minus limit/offset)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    const repo = new mod.AIDecisionRepository();
    await repo.countDecisions({
      model_name: 'gpt-4',
      start_date: '2026-01-01',
      end_date: '2026-02-01',
      min_confidence: 0.5,
      max_confidence: 0.9,
    });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT COUNT(*) as total FROM ai_decisions');
    expect(sql).toContain('model_name = $1');
    expect(sql).toContain('created_at >= $2');
    expect(sql).toContain('created_at <= $3');
    expect(sql).toContain('confidence >= $4');
    expect(sql).toContain('confidence <= $5');
    expect(mockQuery.mock.calls[0][1]).toEqual(['gpt-4', '2026-01-01', '2026-02-01', 0.5, 0.9]);
  });
});

describe('mapDecisionRow edge cases', () => {
  it('returns an empty object when output is an empty string', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...decisionRow, output: '' }],
    });
    const repo = new mod.AIDecisionRepository();
    const out = await repo.getDecisions();
    expect(out[0].output).toEqual({});
  });
});

describe('singleton', () => {
  it('getAIDecisionRepository returns the same instance', () => {
    const a = mod.getAIDecisionRepository();
    const b = mod.getAIDecisionRepository();
    expect(a).toBe(b);
  });
});

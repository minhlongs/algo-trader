/**
 * Tests for ab-test-manager — experiment CRUD, group assignment, outcome
 * tracking and result aggregation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockQuery } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQuery: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../db/postgres-client', () => ({ getDbClient: () => ({ query: mockQuery }) }));

import {
  createExperiment, startExperiment, assignGroup, recordOutcome, getResults, listExperiments, type Experiment,
} from '../ab-test-manager';

function experimentRow(overrides: Partial<Experiment> = {}): Record<string, unknown> {
  return {
    id: 1, name: 'exp', description: null, controlName: 'control', treatmentName: 'treatment',
    status: 'draft', trafficPct: 50, minSamples: 30, confidenceLevel: 0.95,
    startedAt: null, endedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('createExperiment & startExperiment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts the experiment and returns the created row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 7, name: 'my-exp' })], rowCount: 1 });
    const exp = await createExperiment({ name: 'my-exp', controlName: 'control', treatmentName: 'treatment' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [insertSql] = mockQuery.mock.calls[0]!;
    expect(insertSql).toContain('INSERT INTO ab_test_experiments');
    expect(insertSql).toContain('control_name');
    expect(insertSql).toContain('treatment_name');
    expect(exp.id).toBe(7);
    expect(exp.name).toBe('my-exp');
  });

  it('applies defaults for optional fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 1 })], rowCount: 1 });
    await createExperiment({ name: 'x', controlName: 'a', treatmentName: 'b' });
    expect(mockQuery.mock.calls[0]![1]).toEqual(['x', null, 'a', 'b', 50, 30, 0.95]);
  });

  it('updates status to running and returns the experiment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 5, status: 'running', startedAt: new Date() })], rowCount: 1 });
    const exp = await startExperiment(5);
    const [updateSql] = mockQuery.mock.calls[0]!;
    expect(updateSql).toContain("UPDATE ab_test_experiments SET status='running'");
    expect(updateSql).toContain('started_at=NOW()');
    expect(updateSql).toContain("WHERE id=$1 AND status='draft'");
    expect(exp.status).toBe('running');
  });
});

describe('assignGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing assignment without re-inserting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ group_name: 'treatment' }], rowCount: 1 });
    expect(await assignGroup(3, 'sig-1')).toEqual({ group: 'treatment', alreadyAssigned: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('hashes and inserts a new assignment deterministically', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 9, trafficPct: 40 })], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await assignGroup(9, 'sig-9');
    expect(res.alreadyAssigned).toBe(false);
    expect(['control', 'treatment']).toContain(res.group);
    const [insertSql, insertParams] = mockQuery.mock.calls[2]!;
    expect(insertSql).toContain('INSERT INTO ab_test_assignments');
    expect(insertSql).toContain('ON CONFLICT (experiment_id, signal_id) DO NOTHING');
    expect(insertParams).toEqual([9, 'sig-9', res.group]);
  });

  it('is deterministic for the same signalId', async () => {
    const results: string[] = [];
    for (let i = 0; i < 2; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 9, trafficPct: 100 })], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      results.push((await assignGroup(9, 'same-signal')).group);
    }
    expect(results[0]).toBe(results[1]);
  });
});

describe('recordOutcome', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts an outcome and upserts on conflict', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await recordOutcome(4, 'sig-4', 'control', true, 0.8, 12.5, { foo: 'bar' });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO ab_test_outcomes');
    expect(sql).toContain('ON CONFLICT (experiment_id, signal_id) DO UPDATE');
    expect(params).toEqual([4, 'sig-4', 'control', true, 0.8, 12.5, '{"foo":"bar"}']);
  });

  it('uses null for optional confidence/pnl and metadata', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await recordOutcome(4, 'sig-4', 'treatment', false);
    expect(mockQuery.mock.calls[0]![1]).toEqual([4, 'sig-4', 'treatment', false, null, 0, null]);
  });
});

describe('getResults & listExperiments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when the experiment does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(getResults(99)).rejects.toThrow('Experiment 99 not found');
  });

  it('aggregates outcomes and computes significance', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 1, confidenceLevel: 0.95, minSamples: 30 })], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [
      { group_name: 'control', correct: true, confidence: '0.8', pnl: '10' },
      { group_name: 'control', correct: false, confidence: '0.5', pnl: '-5' },
      { group_name: 'treatment', correct: true, confidence: '0.9', pnl: '20' },
      { group_name: 'treatment', correct: true, confidence: '0.95', pnl: '25' },
    ], rowCount: 4 });
    const res = await getResults(1);
    expect(res.experiment.id).toBe(1);
    expect(res.control).toMatchObject({ total: 2, correct: 1, accuracy: 0.5 });
    expect(res.treatment).toMatchObject({ total: 2, correct: 2, accuracy: 1 });
    expect(typeof res.pValue).toBe('number');
    expect(typeof res.recommendation).toBe('string');
  });

  it('reports no winner when significance is not reached', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 1, confidenceLevel: 0.95, minSamples: 30 })], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [
      { group_name: 'control', correct: false, confidence: '0.5', pnl: '0' },
      { group_name: 'treatment', correct: false, confidence: '0.5', pnl: '0' },
    ], rowCount: 2 });
    const res = await getResults(1);
    expect(res.significant).toBe(false);
    expect(res.winner).toBeNull();
  });

  it('lists all experiments ordered by createdAt desc and handles empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [experimentRow({ id: 1 }), experimentRow({ id: 2 })], rowCount: 2 });
    expect(await listExperiments()).toHaveLength(2);
    expect(mockQuery.mock.calls[0]![0]).toContain('ORDER BY created_at DESC');

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await listExperiments()).toEqual([]);
  });
});

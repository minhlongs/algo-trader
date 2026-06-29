/**
 * Tests for AIDecisionRepository
 * Covers: recordDecision, recordMetadata, getDecisions with filters
 *
 * Uses vi.mock to mock postgres-client.query() with in-memory row storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryResult } from 'pg';

// Mock postgres-client before importing the repository
vi.mock('../../shared/db/postgres-client', () => {
  return { query: vi.fn() };
});

import { query } from '../../shared/db/postgres-client';
import { AIDecisionRepository } from '../ai-decision-repository';

interface MockRow {
  id: string;
  model_name: string;
  input_hash: string;
  output: string;
  confidence: string;
  latency_ms: string;
  created_at: string;
}

interface MockMetadataRow {
  id: string;
  decision_id: string;
  key: string;
  value: string;
  created_at: string;
}

describe('AIDecisionRepository', () => {
  let repo: AIDecisionRepository;

  beforeEach(() => {
    repo = new AIDecisionRepository();
    query.mockReset();
  });

  // ──── recordDecision ────

  describe('recordDecision', () => {
    it('should insert a decision and return the mapped row', async () => {
      const now = '2025-06-29T12:00:00Z';
      const mockRow: MockRow = {
        id: 'dec-001',
        model_name: 'deepseek-r1',
        input_hash: 'abc123hash',
        output: '{"action":"buy"}',
        confidence: '0.92',
        latency_ms: '150',
        created_at: now,
      };

      query.mockResolvedValue({ rows: [mockRow] } as unknown as QueryResult<MockRow>);

      const result = await repo.recordDecision({
        model_name: 'deepseek-r1',
        input_hash: 'abc123hash',
        output: { action: 'buy' },
        confidence: 0.92,
        latency_ms: 150,
      });

      expect(result.id).toBe('dec-001');
      expect(result.model_name).toBe('deepseek-r1');
      expect(result.input_hash).toBe('abc123hash');
      expect(result.output).toEqual({ action: 'buy' });
      expect(result.confidence).toBe(0.92);
      expect(result.latency_ms).toBe(150);
      expect(result.created_at).toBe(now);

      // Verify INSERT was called with correct SQL
      const call = query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO ai_decisions');
      expect(call[1]).toEqual(['deepseek-r1', 'abc123hash', '{"action":"buy"}', 0.92, 150]);
    });

    it('should use default empty output and zero latency when not provided', async () => {
      const mockRow: MockRow = {
        id: 'dec-002',
        model_name: 'nemotron',
        input_hash: 'def456',
        output: '{}',
        confidence: '0.75',
        latency_ms: '0',
        created_at: '2025-06-29T12:00:00Z',
      };

      query.mockResolvedValue({ rows: [mockRow] } as unknown as QueryResult<MockRow>);

      const result = await repo.recordDecision({
        model_name: 'nemotron',
        input_hash: 'def456',
        output: {},
        confidence: 0.75,
        latency_ms: 0,
      });

      expect(result.output).toEqual({});
      expect(result.latency_ms).toBe(0);
    });
  });

  // ──── recordMetadata ────

  describe('recordMetadata', () => {
    it('should insert a metadata entry and return the mapped row', async () => {
      const mockRow: MockMetadataRow = {
        id: 'meta-001',
        decision_id: 'dec-001',
        key: 'strategy',
        value: 'pm-arb',
        created_at: '2025-06-29T12:00:00Z',
      };

      query.mockResolvedValue({ rows: [mockRow] } as unknown as QueryResult<MockMetadataRow>);

      const result = await repo.recordMetadata('dec-001', 'strategy', 'pm-arb');

      expect(result.id).toBe('meta-001');
      expect(result.decision_id).toBe('dec-001');
      expect(result.key).toBe('strategy');
      expect(result.value).toBe('pm-arb');

      const call = query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO ai_decision_metadata');
      expect(call[1]).toEqual(['dec-001', 'strategy', 'pm-arb']);
    });
  });

  // ──── getDecisions ────

  describe('getDecisions', () => {
    const baseRows: MockRow[] = [
      {
        id: 'dec-1',
        model_name: 'deepseek-r1',
        input_hash: 'hash-a',
        output: '{"action":"buy"}',
        confidence: '0.95',
        latency_ms: '120',
        created_at: '2025-06-29T10:00:00Z',
      },
      {
        id: 'dec-2',
        model_name: 'nemotron',
        input_hash: 'hash-b',
        output: '{"action":"sell"}',
        confidence: '0.60',
        latency_ms: '80',
        created_at: '2025-06-29T09:00:00Z',
      },
      {
        id: 'dec-3',
        model_name: 'deepseek-r1',
        input_hash: 'hash-c',
        output: '{"action":"hold"}',
        confidence: '0.80',
        latency_ms: '200',
        created_at: '2025-06-29T08:00:00Z',
      },
    ];

    it('should return all decisions ordered by created_at DESC when no filters', async () => {
      query.mockResolvedValue({ rows: baseRows } as unknown as QueryResult<MockRow>);

      const results = await repo.getDecisions();

      expect(results.length).toBe(3);
      expect(results[0].id).toBe('dec-1'); // newest first
      expect(results[1].id).toBe('dec-2');
      expect(results[2].id).toBe('dec-3');

      const call = query.mock.calls[0];
      expect(call[0]).toContain('ORDER BY created_at DESC');
    });

    it('should filter by model_name', async () => {
      const filtered = baseRows.filter(r => r.model_name === 'deepseek-r1');
      query.mockResolvedValue({ rows: filtered } as unknown as QueryResult<MockRow>);

      const results = await repo.getDecisions({ model_name: 'deepseek-r1' });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.model_name === 'deepseek-r1')).toBe(true);

      const call = query.mock.calls[0];
      expect(call[0]).toContain('model_name = $');
      expect(call[1]).toContain('deepseek-r1');
    });

    it('should filter by date range (start_date and end_date)', async () => {
      const filtered = baseRows.filter(r => r.created_at >= '2025-06-29T09:00:00Z' && r.created_at <= '2025-06-29T10:30:00Z');
      query.mockResolvedValue({ rows: filtered } as unknown as QueryResult<MockRow>);

      const results = await repo.getDecisions({
        start_date: '2025-06-29T09:00:00Z',
        end_date: '2025-06-29T10:30:00Z',
      });

      expect(results.length).toBe(2);
      const call = query.mock.calls[0];
      expect(call[0]).toContain('created_at >= $');
      expect(call[0]).toContain('created_at <= $');
    });

    it('should filter by confidence range (min and max)', async () => {
      const filtered = baseRows.filter(r => parseFloat(r.confidence) >= 0.7 && parseFloat(r.confidence) <= 0.95);
      query.mockResolvedValue({ rows: filtered } as unknown as QueryResult<MockRow>);

      const results = await repo.getDecisions({
        min_confidence: 0.7,
        max_confidence: 0.95,
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.confidence >= 0.7 && r.confidence <= 0.95)).toBe(true);
    });

    it('should support pagination with limit and offset', async () => {
      query.mockResolvedValue({ rows: [baseRows[0]] } as unknown as QueryResult<MockRow>);

      await repo.getDecisions({ limit: 1, offset: 1 });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('LIMIT');
      expect(call[0]).toContain('OFFSET');
      expect(call[1]).toContain(1);
      expect(call[1]).toContain(1);
    });

    it('should combine multiple filters', async () => {
      const filtered = baseRows.filter(
        (r) => r.model_name === 'deepseek-r1' && parseFloat(r.confidence) >= 0.8
      );
      query.mockResolvedValue({ rows: filtered } as unknown as QueryResult<MockRow>);

      const results = await repo.getDecisions({
        model_name: 'deepseek-r1',
        min_confidence: 0.8,
        limit: 10,
      });

      expect(results.length).toBe(2);
    });
  });

  // ──── getDecisionWithMetadata ────

  describe('getDecisionWithMetadata', () => {
    it('should return decision with metadata entries', async () => {
      const decisionRow: MockRow = {
        id: 'dec-001',
        model_name: 'deepseek-r1',
        input_hash: 'hash-a',
        output: '{"action":"buy"}',
        confidence: '0.92',
        latency_ms: '150',
        created_at: '2025-06-29T12:00:00Z',
      };

      const metaRows: MockMetadataRow[] = [
        { id: 'm1', decision_id: 'dec-001', key: 'strategy', value: 'pm-arb', created_at: '2025-06-29T12:00:00Z' },
        { id: 'm2', decision_id: 'dec-001', key: 'tenant', value: 'tenant-42', created_at: '2025-06-29T12:00:00Z' },
      ];

      // First call: decision lookup, second call: metadata lookup
      query.mockResolvedValueOnce({ rows: [decisionRow] } as unknown as QueryResult<MockRow>);
      query.mockResolvedValueOnce({ rows: metaRows } as unknown as QueryResult<MockMetadataRow>);

      const result = await repo.getDecisionWithMetadata('dec-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('dec-001');
      expect(result!.model_name).toBe('deepseek-r1');
      expect(result!.metadata.length).toBe(2);
      expect(result!.metadata[0].key).toBe('strategy');
      expect(result!.metadata[0].value).toBe('pm-arb');
      expect(result!.metadata[1].key).toBe('tenant');
      expect(result!.metadata[1].value).toBe('tenant-42');
    });

    it('should return null when decision not found', async () => {
      query.mockResolvedValueOnce({ rows: [] } as unknown as QueryResult<MockRow>);

      const result = await repo.getDecisionWithMetadata('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return empty metadata array when no metadata entries exist', async () => {
      const decisionRow: MockRow = {
        id: 'dec-002',
        model_name: 'nemotron',
        input_hash: 'hash-b',
        output: '{}',
        confidence: '0.75',
        latency_ms: '80',
        created_at: '2025-06-29T11:00:00Z',
      };

      query.mockResolvedValueOnce({ rows: [decisionRow] } as unknown as QueryResult<MockRow>);
      query.mockResolvedValueOnce({ rows: [] } as unknown as QueryResult<MockMetadataRow>);

      const result = await repo.getDecisionWithMetadata('dec-002');

      expect(result).not.toBeNull();
      expect(result!.metadata.length).toBe(0);
    });
  });
});

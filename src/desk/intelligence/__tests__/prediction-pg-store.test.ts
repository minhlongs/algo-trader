/**
 * Prediction PG Store Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertPredictionPg, updatePredictionResolutionPg, batchUpsertPredictionsPg } from '../prediction-pg-store';
import type { Prediction } from '../prediction-accuracy-tracker';

// Mock the shared DB client
vi.mock('../../../shared/db/postgres-client', () => ({
  query: vi.fn(),
}));

import { query } from '../../../shared/db/postgres-client';

const mockQuery = vi.mocked(query);

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred-001',
    marketId: 'market-abc',
    title: 'Test Market',
    predictedOutcome: 'YES',
    confidence: 0.85,
    predictedAt: Date.now(),
    marketYesPrice: 0.65,
    strategy: 'simple-arb',
    actualOutcome: null,
    resolvedAt: null,
    correct: null,
    ...overrides,
  };
}

describe('PredictionPGStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertPredictionPg', () => {
    it('should insert a prediction via upsert', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const pred = makePrediction();
      await upsertPredictionPg(pred);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO prediction_history');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      expect(params).toEqual([
        'pred-001', 'market-abc', 'Test Market', 'YES', 0.85,
        pred.predictedAt, 0.65, 'simple-arb', null, null, null,
      ]);
    });

    it('should handle PG errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('connection refused'));

      // Should not throw
      await upsertPredictionPg(makePrediction());
    });
  });

  describe('updatePredictionResolutionPg', () => {
    it('should update resolution fields', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await updatePredictionResolutionPg('pred-001', 'YES', true);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0]!;
      expect(sql).toContain('UPDATE prediction_history');
      expect(sql).toContain('actual_outcome = $2');
      expect(sql).toContain('correct = $3');
      expect(params[0]).toBe('pred-001');
      expect(params[1]).toBe('YES');
      expect(params[2]).toBe(true);
    });

    it('should handle PG errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('timeout'));

      // Should not throw
      await updatePredictionResolutionPg('pred-001', 'NO', false);
    });
  });

  describe('batchUpsertPredictionsPg', () => {
    it('should upsert multiple predictions sequentially', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const preds = [
        makePrediction({ id: 'pred-001' }),
        makePrediction({ id: 'pred-002' }),
        makePrediction({ id: 'pred-003' }),
      ];

      await batchUpsertPredictionsPg(preds);

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[0]![1]![0]).toBe('pred-001');
      expect(mockQuery.mock.calls[1]![1]![0]).toBe('pred-002');
      expect(mockQuery.mock.calls[2]![1]![0]).toBe('pred-003');
    });
  });
});

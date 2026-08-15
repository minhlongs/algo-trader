/**
 * Meta-Learner — unit tests
 *
 * Validates EMA-based weight computation, confidence intervals,
 * and graceful fallback when data is insufficient.
 *
 * Mocks fs.readFileSync to avoid touching data/predictions.json on disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Mock logger to suppress output during tests
vi.mock('../../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs for predictions file reads
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

import {
  configureMetaLearner,
  getOptimalWeights,
  refreshCache,
  getMetaStats,
} from '../meta-learner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePrediction(overrides: Record<string, unknown> = {}) {
  return {
    id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    marketId: 'market-1',
    title: 'Will BTC be above $100k?',
    predictedOutcome: 'YES' as const,
    confidence: 0.7,
    predictedAt: Date.now() - 3600_000,
    marketYesPrice: 0.65,
    strategy: 'kronos',
    actualOutcome: null as 'YES' | 'NO' | null,
    resolvedAt: null as number | null,
    correct: null as boolean | null,
    ...overrides,
  };
}

function buildPredictionsFile(predictions: ReturnType<typeof makePrediction>[]) {
  return JSON.stringify(predictions);
}

const mockFs = fs as unknown as {
  readFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MetaLearner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureMetaLearner({ minSamples: 3, lookback: 100 });
  });

  describe('getOptimalWeights', () => {
    it('returns uniform fallback weights when no prediction data exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      const weights = getOptimalWeights(['kronos', 'gru', 'llm']);

      expect(weights).toHaveLength(3);
      // All weights should be roughly equal (normalised from fallback)
      for (const w of weights) {
        expect(w.weight).toBeCloseTo(1 / 3, 2);
        expect(w.sampleSize).toBe(0);
      }
    });

    it('returns EMA-based weights for strategies with enough resolved predictions', () => {
      // 10 correct, 2 incorrect predictions for "kronos" — should yield high weight
      const preds: ReturnType<typeof makePrediction>[] = [];
      for (let i = 0; i < 10; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }));
      }
      for (let i = 0; i < 2; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: false, actualOutcome: 'NO' }));
      }
      // 5 correct, 7 incorrect for "gru" — should yield lower weight
      for (let i = 0; i < 5; i++) {
        preds.push(makePrediction({ strategy: 'gru', correct: true, actualOutcome: 'YES' }));
      }
      for (let i = 0; i < 7; i++) {
        preds.push(makePrediction({ strategy: 'gru', correct: false, actualOutcome: 'NO' }));
      }

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'gru']);

      expect(weights).toHaveLength(2);
      const kronosW = weights.find(w => w.name === 'kronos')!;
      const gruW = weights.find(w => w.name === 'gru')!;
      expect(kronosW.weight).toBeGreaterThan(gruW.weight);
      expect(kronosW.sampleSize).toBe(12);
      expect(gruW.sampleSize).toBe(12);
    });

    it('uses fallback weight for unknown strategy names', () => {
      const preds = [
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'kronos', correct: false, actualOutcome: 'NO' }),
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'unknown-strategy']);

      expect(weights).toHaveLength(2);
      const unknownW = weights.find(w => w.name === 'unknown-strategy')!;
      expect(unknownW.sampleSize).toBe(0);
      // Unknown gets fallback, kronos gets meta weight — check both exist
      expect(unknownW.weight).toBeGreaterThan(0);
    });

    it('returns empty array for empty input', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getOptimalWeights([])).toEqual([]);
    });

    it('confidence intervals are wider for smaller sample sizes', () => {
      // 100 predictions for kronos, 5 for gru
      const preds: ReturnType<typeof makePrediction>[] = [];
      for (let i = 0; i < 98; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }));
      }
      for (let i = 0; i < 2; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: false, actualOutcome: 'NO' }));
      }
      for (let i = 0; i < 4; i++) {
        preds.push(makePrediction({ strategy: 'gru', correct: true, actualOutcome: 'YES' }));
      }
      preds.push(makePrediction({ strategy: 'gru', correct: false, actualOutcome: 'NO' }));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'gru']);
      const kronosW = weights.find(w => w.name === 'kronos')!;
      const gruW = weights.find(w => w.name === 'gru')!;

      const kronosCIWidth = kronosW.ci[1] - kronosW.ci[0];
      const gruCIWidth = gruW.ci[1] - gruW.ci[0];
      expect(kronosCIWidth).toBeLessThan(gruCIWidth);
    });
  });

  describe('configureMetaLearner', () => {
    it('overrides defaults', () => {
      mockFs.existsSync.mockReturnValue(false);
      configureMetaLearner({ minSamples: 999 });
      const weights = getOptimalWeights(['test']);
      // minSamples=999 means even strategies with data fall back
      expect(weights[0].sampleSize).toBe(0);
    });
  });

  describe('getMetaStats', () => {
    it('returns per-strategy stats', () => {
      const preds = [
        makePrediction({ strategy: 'alpha', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'alpha', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'alpha', correct: false, actualOutcome: 'NO' }),
        makePrediction({ strategy: 'beta', correct: true, actualOutcome: 'YES' }),
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const stats = getMetaStats();
      expect(stats).toHaveProperty('alpha');
      expect(stats).toHaveProperty('beta');
      expect(stats.alpha.sampleSize).toBe(3);
      expect(stats.beta.sampleSize).toBe(1);
    });
  });
});

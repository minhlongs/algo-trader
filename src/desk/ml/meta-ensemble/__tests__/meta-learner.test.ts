/**
 * Meta-Learner — unit tests
 *
 * Validates EMA-based weight computation, confidence intervals,
 * and graceful fallback when data is insufficient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  configureMetaLearner,
  getOptimalWeights,
  getMetaStats,
} from '../meta-learner';
import {
  makePrediction,
  buildPredictionsFile,
  generateStrategyPredictions,
} from './meta-learner-fixtures';

vi.mock('../../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

const mockFs = fs as unknown as {
  readFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
};

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
      for (const w of weights) {
        expect(w.weight).toBeCloseTo(1 / 3, 2);
        expect(w.sampleSize).toBe(0);
      }
    });

    it('returns EMA-based weights for strategies with enough resolved predictions', () => {
      const kronosPreds = generateStrategyPredictions('kronos', 10, 2);
      const gruPreds = generateStrategyPredictions('gru', 5, 7);
      const preds = [...kronosPreds, ...gruPreds];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'gru']);
      expect(weights).toHaveLength(2);
      const kronosW = weights.find((w) => w.name === 'kronos')!;
      const gruW = weights.find((w) => w.name === 'gru')!;
      expect(kronosW.weight).toBeGreaterThan(gruW.weight);
      expect(kronosW.sampleSize).toBe(12);
      expect(gruW.sampleSize).toBe(12);
    });

    it('uses fallback weight for unknown strategy names', () => {
      const preds = [
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        makePrediction({ strategy: 'kronos', correct: false, actualOutcome: 'NO' }),
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'unknown-strategy']);
      expect(weights).toHaveLength(2);
      const unknownW = weights.find((w) => w.name === 'unknown-strategy')!;
      expect(unknownW.sampleSize).toBe(0);
      expect(unknownW.weight).toBeGreaterThan(0);
    });

    it('returns empty array for empty input', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getOptimalWeights([])).toEqual([]);
    });

    it('confidence intervals are wider for smaller sample sizes', () => {
      const kronosPreds = generateStrategyPredictions('kronos', 98, 2);
      const gruPreds = [
        ...generateStrategyPredictions('gru', 4, 0),
        makePrediction({ strategy: 'gru', correct: false, actualOutcome: 'NO' }),
      ];
      const preds = [...kronosPreds, ...gruPreds];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const weights = getOptimalWeights(['kronos', 'gru']);
      const kronosW = weights.find((w) => w.name === 'kronos')!;
      const gruW = weights.find((w) => w.name === 'gru')!;

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

/**
 * Adaptive Fusion Engine — Unit tests (Meta vs static weight selection)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

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

import { adaptiveFuse, resetAdaptiveFusionState } from '../adaptive-fusion';
import { configureMetaLearner } from '../meta-learner';
import {
  makeSignal,
  makePrediction,
  buildPredictionsFile,
  type TestPrediction,
} from './adaptive-fusion-fixtures';

const mockFs = fs as unknown as {
  readFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
};

describe('AdaptiveFusion — weight selection & fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAdaptiveFusionState();
    configureMetaLearner({ minSamples: 3, lookback: 100 });
  });

  describe('meta vs static weight selection', () => {
    it('uses meta weights when enough historical data exists', () => {
      const preds: TestPrediction[] = [];
      for (let i = 0; i < 10; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }));
      }
      for (let i = 0; i < 4; i++) {
        preds.push(makePrediction({ strategy: 'gru', correct: false, actualOutcome: 'NO' }));
      }

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const signals = [
        makeSignal({ name: 'kronos', score: 0.5, weight: 1.0 }),
        makeSignal({ name: 'gru', score: 0.5, weight: 1.0 }),
      ];

      const result = adaptiveFuse(signals, { minMetaSamples: 3 });
      expect(result.weightSource.kronos).toBe('meta');
      expect(result.weightSource.gru).toBe('meta');
      expect(result.metaWeights).toBeDefined();
      const kronosMW = result.metaWeights?.find((w) => w.name === 'kronos');
      const gruMW = result.metaWeights?.find((w) => w.name === 'gru');
      expect(kronosMW?.weight).toBeGreaterThan(gruMW?.weight ?? 0);
    });

    it('falls back to static weights when meta has insufficient data', () => {
      const preds = [
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(buildPredictionsFile(preds));

      const signals = [
        makeSignal({ name: 'kronos', score: 0.5, weight: 0.8 }),
        makeSignal({ name: 'gru', score: 0.5, weight: 1.2 }),
      ];

      const result = adaptiveFuse(signals, { minMetaSamples: 3 });
      expect(result.weightSource.kronos).toBe('static');
      expect(result.weightSource.gru).toBe('static');
      expect(result.signals.find((s) => s.name === 'kronos')?.weight).toBe(0.8);
      expect(result.signals.find((s) => s.name === 'gru')?.weight).toBe(1.2);
    });

    it('uses fallbackWeights map for unknown strategies', () => {
      mockFs.existsSync.mockReturnValue(false);

      const signals = [
        makeSignal({ name: 'kronos', score: 0.5, weight: 1.0 }),
        makeSignal({ name: 'gru', score: 0.5, weight: 1.0 }),
      ];

      const result = adaptiveFuse(signals, {
        fallbackWeights: { kronos: 0.7, gru: 1.3 },
      });

      expect(result.weightSource.kronos).toBe('static');
      expect(result.weightSource.gru).toBe('static');
      const kronosS = result.signals.find((s) => s.name === 'kronos');
      const gruS = result.signals.find((s) => s.name === 'gru');
      expect(kronosS?.weight).toBeCloseTo(0.7, 5);
      expect(gruS?.weight).toBeCloseTo(1.3, 5);
    });
  });
});

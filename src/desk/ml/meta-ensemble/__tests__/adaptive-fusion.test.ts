/**
 * Adaptive Fusion Engine — unit tests
 *
 * Validates meta/static weight selection, regime adaptation,
 * fallback behaviour, and backward compatibility with FuseResult.
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
import type { SignalInput } from '../../../../intelligence/signal-fusion-engine';

const mockFs = fs as unknown as {
  readFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<SignalInput> = {}): SignalInput {
  return { name: 'default', score: 0.5, weight: 1.0, ...overrides };
}

function makePrediction(overrides: Record<string, unknown> = {}) {
  return {
    id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    marketId: 'm1',
    title: 'test',
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AdaptiveFusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAdaptiveFusionState();
    configureMetaLearner({ minSamples: 3, lookback: 100 });
  });

  describe('basic fusion', () => {
    it('returns NEUTRAL for empty signals', () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = adaptiveFuse([]);
      expect(result.direction).toBe('NEUTRAL');
      expect(result.confidence).toBe(0);
    });

    it('fuses single positive signal as UP', () => {
      mockFs.existsSync.mockReturnValue(false);
      const signals = [makeSignal({ name: 'kronos', score: 0.8, weight: 1.0 })];
      const result = adaptiveFuse(signals);
      expect(result.direction).toBe('UP');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('fuses opposing signals correctly', () => {
      mockFs.existsSync.mockReturnValue(false);
      const signals = [
        makeSignal({ name: 'kronos', score: 0.65, weight: 1.0 }),
        makeSignal({ name: 'gru', score: -0.4, weight: 1.0 }),
      ];
      const result = adaptiveFuse(signals);
      // Weighted avg = (0.65*1 + -0.4*1) / 2 = 0.125 → UP (> 0.1 threshold)
      expect(result.direction).toBe('UP');
    });
  });

  describe('meta vs static weight selection', () => {
    it('uses meta weights when enough historical data exists', () => {
      const preds: ReturnType<typeof makePrediction>[] = [];
      // 10 correct predictions for "kronos"
      for (let i = 0; i < 10; i++) {
        preds.push(makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }));
      }
      // 4 incorrect for "gru" (needs ≥ minMetaSamples=3 for meta weight selection)
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
      // Meta weights: kronos higher win-rate → higher weight
      expect(result.metaWeights).toBeDefined();
      const kronosMW = result.metaWeights!.find(w => w.name === 'kronos')!;
      const gruMW = result.metaWeights!.find(w => w.name === 'gru')!;
      expect(kronosMW.weight).toBeGreaterThan(gruMW.weight);
    });

    it('falls back to static weights when meta has insufficient data', () => {
      const preds = [
        makePrediction({ strategy: 'kronos', correct: true, actualOutcome: 'YES' }),
        // Only 1 sample — below minSamples threshold
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
      // Static weights preserved from input
      expect(result.signals.find(s => s.name === 'kronos')!.weight).toBe(0.8);
      expect(result.signals.find(s => s.name === 'gru')!.weight).toBe(1.2);
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
      // fallbackWeights applied
      const kronosS = result.signals.find(s => s.name === 'kronos')!;
      const gruS = result.signals.find(s => s.name === 'gru')!;
      expect(kronosS.weight).toBeCloseTo(0.7, 5);
      expect(gruS.weight).toBeCloseTo(1.3, 5);
    });
  });

  describe('regime adaptation', () => {
    it('applies regime when provided', () => {
      mockFs.existsSync.mockReturnValue(false);

      const signals = [
        makeSignal({ name: 'momentum', score: 0.5, weight: 1.0 }),
        makeSignal({ name: 'revert', score: -0.4, weight: 1.0 }),
      ];

      const result = adaptiveFuse(signals, { regime: 'trending_up' });
      expect(result.direction).toBeDefined();
      // Momentum should be boosted in trending_up
      const momentumW = result.signals.find(s => s.name === 'momentum')!.weight;
      const revertW = result.signals.find(s => s.name === 'revert')!.weight;
      expect(momentumW).toBeGreaterThan(revertW);
    });

    it('works without regime (no adaptation)', () => {
      mockFs.existsSync.mockReturnValue(false);

      const signals = [
        makeSignal({ name: 'momentum', score: 0.5, weight: 1.0 }),
        makeSignal({ name: 'revert', score: -0.4, weight: 1.0 }),
      ];

      const withRegime = adaptiveFuse(signals, { regime: 'trending_up' });
      const withoutRegime = adaptiveFuse(signals);
      // Without regime, equal weights → different weighted score
      expect(withRegime.direction).toBeDefined();
      expect(withoutRegime.direction).toBeDefined();
    });
  });

  describe('backward compatibility', () => {
    it('AdaptiveFusionResult has all FusionResult fields', () => {
      mockFs.existsSync.mockReturnValue(false);
      const signals = [makeSignal({ name: 'test', score: 0.3, weight: 1.0 })];
      const result = adaptiveFuse(signals);

      // Core FusionResult fields
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('weightedScore');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('reasoning');

      // Extended fields
      expect(result).toHaveProperty('weightSource');
      expect(result).toHaveProperty('metaWeights');
    });
  });
});

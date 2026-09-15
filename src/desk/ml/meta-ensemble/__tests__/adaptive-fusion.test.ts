/**
 * Adaptive Fusion Engine — Unit tests (Basic fusion, regime adaptation & compatibility)
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
import { makeSignal } from './adaptive-fusion-fixtures';

const mockFs = fs as unknown as {
  readFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
};

describe('AdaptiveFusion — basic & regime', () => {
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
      expect(result.direction).toBe('UP');
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
      const momentumW = result.signals.find((s) => s.name === 'momentum')?.weight ?? 0;
      const revertW = result.signals.find((s) => s.name === 'revert')?.weight ?? 0;
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
      expect(withRegime.direction).toBeDefined();
      expect(withoutRegime.direction).toBeDefined();
    });
  });

  describe('backward compatibility', () => {
    it('AdaptiveFusionResult has all FusionResult fields', () => {
      mockFs.existsSync.mockReturnValue(false);
      const signals = [makeSignal({ name: 'test', score: 0.3, weight: 1.0 })];
      const result = adaptiveFuse(signals);

      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('weightedScore');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('reasoning');

      expect(result).toHaveProperty('weightSource');
      expect(result).toHaveProperty('metaWeights');
    });
  });
});

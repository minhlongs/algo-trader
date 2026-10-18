/**
 * run-experiment-helpers — Unit Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { parseArgs, suggestFamilies, validateConfig, pickMetrics, mapBaselines } from '../run-experiment-helpers';
import type { ExperimentConfig, SplitMetrics } from '../experiments/experiment-types';
import type { MarketRegime } from '../regimes/regime-types';

vi.mock('../provenance/verdict-summary', () => ({
  loadVerdictSummary: vi.fn().mockResolvedValue({ totalRecords: 10, byStrategy: { s1: 5 } }),
}));

vi.mock('../alpha-discovery/strategy-family-registry', () => ({
  createDefaultRegistry: vi.fn().mockReturnValue({ families: [] }),
}));

vi.mock('../alpha-discovery/research-informed', () => ({
  prioritizeFamilies: vi.fn().mockReturnValue([{ familyId: 'fam-1', score: 0.9, reason: 'untested' }]),
}));

const VALID_CONFIG: ExperimentConfig = {
  experimentId: 'exp-1', symbol: 'BTC/USDT', timeframe: '1h', features: ['rsi_14'],
  tp: 0.02, sl: 0.01, split: { trainRatio: 0.7, valRatio: 0.15, testRatio: 0.15 },
  cost: { feeBps: 5, slippageBps: 2 }, seed: 42, lookback: 20,
};

describe('run-experiment-helpers', () => {
  describe('parseArgs', () => {
    it('parses --config, --record, and --suggest flags', () => {
      expect(parseArgs(['node', 'script', '--config', 'cfg.json'])).toEqual({
        configPath: 'cfg.json', record: false, suggest: false,
      });
      expect(parseArgs(['node', 'script', '--config', 'cfg.json', '--record', '--suggest'])).toEqual({
        configPath: 'cfg.json', record: true, suggest: true,
      });
      expect(parseArgs(['node', 'script', '--suggest'])).toEqual({
        configPath: undefined, record: false, suggest: true,
      });
    });

    it('throws when flags are missing or incomplete', () => {
      expect(() => parseArgs(['node', 'script'])).toThrow('Usage: run-experiment');
      expect(() => parseArgs(['node', 'script', '--config'])).toThrow('Usage: run-experiment');
    });
  });

  describe('suggestFamilies', () => {
    it('loads ledger summary and prioritizes strategy families', async () => {
      const res = await suggestFamilies('dummy-ledger.json');
      expect(res.summary.totalRecords).toBe(10);
      expect(res.suggestions).toHaveLength(1);
      expect(res.suggestions[0]?.familyId).toBe('fam-1');
    });
  });

  describe('validateConfig', () => {
    it('passes for valid config', () => {
      expect(() => validateConfig(VALID_CONFIG)).not.toThrow();
    });

    it('throws on missing experimentId, symbol, or timeframe', () => {
      expect(() => validateConfig({ ...VALID_CONFIG, experimentId: '' })).toThrow('Missing experimentId');
      expect(() => validateConfig({ ...VALID_CONFIG, symbol: '' })).toThrow('Missing symbol');
      expect(() => validateConfig({ ...VALID_CONFIG, timeframe: '' })).toThrow('Missing timeframe');
    });

    it('throws on empty or non-array features', () => {
      expect(() => validateConfig({ ...VALID_CONFIG, features: [] })).toThrow('Features must be a non-empty array');
      const bad = { ...VALID_CONFIG, features: null as unknown as string[] };
      expect(() => validateConfig(bad)).toThrow('Features must be a non-empty array');
    });

    it('throws on invalid tp, sl, or split config', () => {
      expect(() => validateConfig({ ...VALID_CONFIG, tp: 0 })).toThrow('tp must be a positive number');
      expect(() => validateConfig({ ...VALID_CONFIG, tp: -1 })).toThrow('tp must be a positive number');
      expect(() => validateConfig({ ...VALID_CONFIG, sl: 0 })).toThrow('sl must be a positive number');
      expect(() => validateConfig({ ...VALID_CONFIG, sl: -0.5 })).toThrow('sl must be a positive number');

      const noSplit = { ...VALID_CONFIG, split: null as unknown as ExperimentConfig['split'] };
      expect(() => validateConfig(noSplit)).toThrow('Invalid split config');

      const badRatio = { ...VALID_CONFIG, split: { trainRatio: 'bad' as unknown as number, valRatio: 0.1, testRatio: 0.1 } };
      expect(() => validateConfig(badRatio)).toThrow('Invalid split config');
    });
  });

  describe('pickMetrics', () => {
    it('picks 8 core metric fields', () => {
      const input: SplitMetrics = {
        numTrades: 50, winRate: 0.6, lossRate: 0.4, timeoutRate: 0.05,
        meanLabel: 0.01, totalPnl: 1200, sharpeRatio: 1.8, maxDrawdown: 0.08,
      };
      expect(pickMetrics(input)).toEqual(input);
    });
  });

  describe('mapBaselines', () => {
    it('maps baseline report to artifact shape with regimes present and handles zero trades', () => {
      const mockBaselines = [
        {
          name: 'buy_and_hold',
          report: {
            totalPnl: 500, winRate: 0.55, losingTrades: 20,
            totalTrades: 50, sharpeRatio: 1.2, maxDrawdown: 0.15,
          },
        },
      ];
      const regimes: MarketRegime[] = ['BULL', 'BEAR', 'BULL'];
      const mapped = mapBaselines(mockBaselines as unknown as ReturnType<typeof import('../baselines/baseline-runner').runAllBaselines>, regimes);
      expect(mapped).toEqual([
        {
          name: 'buy_and_hold', totalPnl: 500, winRate: 0.55, lossRate: 0.4,
          totalTrades: 50, sharpeRatio: 1.2, maxDrawdown: 0.15, regimesPresent: ['BEAR', 'BULL'],
        },
      ]);

      const zeroBaselines = [
        {
          name: 'empty',
          report: { totalPnl: 0, winRate: 0, losingTrades: 0, totalTrades: 0, sharpeRatio: 0, maxDrawdown: 0 },
        },
      ];
      const mappedZero = mapBaselines(zeroBaselines as unknown as ReturnType<typeof import('../baselines/baseline-runner').runAllBaselines>, []);
      expect(mappedZero[0]?.lossRate).toBe(0);
    });
  });
});

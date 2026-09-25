import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../strategy-family-registry';
import {
  generateFamilyCandidates,
  generateAllCandidateConfigs,
  sampleParamGrid,
  sampleParamRandom,
  snapToStep,
  createLcg,
} from '../candidate-generator';

describe('Candidate Generator', () => {
  const registry = createDefaultRegistry();
  const allFamilies = registry.list();

  it('snapToStep correctly clamps and rounds to step precision', () => {
    expect(snapToStep(12.34, 5, 20, 5)).toBe(10);
    expect(snapToStep(13, 5, 20, 5)).toBe(15);
    expect(snapToStep(0.0013, 0.0002, 0.01, 0.0002)).toBe(0.0014);
    expect(snapToStep(25, 5, 20, 5)).toBe(20);
    expect(snapToStep(2, 5, 20, 5)).toBe(5);
  });

  it('createLcg is deterministic for the same seed', () => {
    const lcg1 = createLcg(42);
    const lcg2 = createLcg(42);
    const vals1 = Array.from({ length: 5 }, () => lcg1());
    const vals2 = Array.from({ length: 5 }, () => lcg2());
    expect(vals1).toEqual(vals2);
  });

  it('sampleParamGrid generates bounded parameter sets with defaultParams as first candidate', () => {
    const family = allFamilies.find((f) => f.id === 'momentum-breakout')!;
    const grid = sampleParamGrid(family.paramBounds, family.defaultParams, { stepsPerParam: 3, maxCombinations: 10 });
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.length).toBeLessThanOrEqual(10);
    expect(grid[0]).toEqual(family.defaultParams);

    for (const params of grid) {
      for (const [key, val] of Object.entries(params)) {
        const bounds = family.paramBounds[key];
        if (bounds) {
          expect(val).toBeGreaterThanOrEqual(bounds.min);
          expect(val).toBeLessThanOrEqual(bounds.max);
        }
      }
    }
  });

  it('sampleParamRandom generates deterministic parameter sets within bounds', () => {
    const family = allFamilies.find((f) => f.id === 'trend-following')!;
    const randomSamples = sampleParamRandom(family.paramBounds, family.defaultParams, 5, 123);
    expect(randomSamples).toHaveLength(5);
    expect(randomSamples[0]).toEqual(family.defaultParams);

    // Repeat with same seed
    const repeatSamples = sampleParamRandom(family.paramBounds, family.defaultParams, 5, 123);
    expect(randomSamples).toEqual(repeatSamples);

    for (const params of randomSamples) {
      for (const [key, val] of Object.entries(params)) {
        const bounds = family.paramBounds[key];
        if (bounds) {
          expect(val).toBeGreaterThanOrEqual(bounds.min);
          expect(val).toBeLessThanOrEqual(bounds.max);
        }
      }
    }
  });

  it('generateFamilyCandidates generates unique candidate IDs with candidate indices', () => {
    const family = allFamilies.find((f) => f.id === 'mean-reversion')!;
    const candidates = generateFamilyCandidates(family, registry, {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      mode: 'random',
      maxCandidatesPerFamily: 4,
      seed: 99,
    });

    expect(candidates).toHaveLength(4);
    const candidateIds = candidates.map((c) => c.candidateId);
    const uniqueIds = new Set(candidateIds);
    expect(uniqueIds.size).toBe(4);
    expect(candidateIds[0]).toBe('mean-reversion-btcusdt-1h-c0');
    expect(candidates[0]!.experimentConfig.experimentId).toBe('mean-reversion-btcusdt-1h-c0');
  });

  it('generateAllCandidateConfigs covers all 4 strategy families', () => {
    const candidates = generateAllCandidateConfigs(registry, {
      symbol: 'ETH/USDT',
      timeframe: '4h',
      mode: 'defaults',
    });

    expect(candidates).toHaveLength(4);
    const families = candidates.map((c) => c.familyId);
    expect(families).toContain('momentum-breakout');
    expect(families).toContain('trend-following');
    expect(families).toContain('mean-reversion');
    expect(families).toContain('volatility-breakout');
  });

  it('generateAllCandidateConfigs supports filtering by camelCase and kebab-case familyIds', () => {
    const candidatesCamel = generateAllCandidateConfigs(registry, {
      symbol: 'SOL/USDT',
      timeframe: '15m',
      familyIds: ['momentumBreakout', 'volatilityBreakout'],
      mode: 'defaults',
    });
    expect(candidatesCamel).toHaveLength(2);
    expect(candidatesCamel.map((c) => c.familyId)).toEqual(['momentum-breakout', 'volatility-breakout']);

    const candidatesKebab = generateAllCandidateConfigs(registry, {
      symbol: 'SOL/USDT',
      timeframe: '15m',
      familyIds: ['trend-following'],
      mode: 'defaults',
    });
    expect(candidatesKebab).toHaveLength(1);
    expect(candidatesKebab[0]!.familyId).toBe('trend-following');
  });
});

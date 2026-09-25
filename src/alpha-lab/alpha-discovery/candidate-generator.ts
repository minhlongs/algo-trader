/**
 * Candidate Generator — Bounded Parameter Sweep Engine
 *
 * Generates candidate alpha configurations across strategy families
 * (momentum-breakout, trend-following, mean-reversion, volatility-breakout)
 * with bounded parameter sweeps (defaults, grid, random) and unique candidate IDs.
 */

import type { StrategyFamily, StrategyFamilyRegistry, ExperimentFromFamilyOptions } from './strategy-family-types';
import type { ExperimentConfig } from '../experiments/experiment-types';
import { experimentFromFamily } from './strategy-family-registry';
import { prioritizeFamilies } from './research-informed';
import type {
  ParamSweepOptions,
  CandidateAlphaConfig,
  GenerateCandidatesOptions,
} from './candidate-generator-types';
import {
  sampleParamGrid,
  sampleParamRandom,
} from './candidate-generator-sampler';

export {
  type ParamSweepOptions,
  type CandidateAlphaConfig,
  type GenerateCandidatesOptions,
} from './candidate-generator-types';

export {
  createLcg,
  snapToStep,
  sampleParamGrid,
  sampleParamRandom,
} from './candidate-generator-sampler';

/**
 * Generate candidate alpha configurations for a single strategy family.
 */
export function generateFamilyCandidates(
  family: StrategyFamily,
  registry: StrategyFamilyRegistry,
  options: GenerateCandidatesOptions,
): CandidateAlphaConfig[] {
  const mode = options.mode ?? 'defaults';
  const maxCandidates = options.maxCandidatesPerFamily ?? 5;
  const seed = options.seed ?? 42;

  let paramSets: Record<string, number>[];
  if (mode === 'grid') {
    paramSets = sampleParamGrid(family.paramBounds, family.defaultParams, {
      stepsPerParam: options.stepsPerParam ?? 3,
      maxCombinations: maxCandidates,
    });
  } else if (mode === 'random') {
    paramSets = sampleParamRandom(family.paramBounds, family.defaultParams, maxCandidates, seed);
  } else {
    paramSets = [{ ...family.defaultParams }];
  }

  const cleanSymbol = options.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');

  return paramSets.map((params, idx) => {
    const candidateId = `${family.id}-${cleanSymbol}-${options.timeframe}-c${idx}`;
    const expOptions: ExperimentFromFamilyOptions = {
      familyId: family.id,
      symbol: options.symbol,
      timeframe: options.timeframe,
      paramOverrides: params,
      feeBps: options.costOverrides?.feeBps,
      slippageBps: options.costOverrides?.slippageBps,
      seed,
    };

    const baseExpConfig = experimentFromFamily(registry, expOptions);
    const experimentConfig: ExperimentConfig = Object.freeze({
      ...baseExpConfig,
      experimentId: candidateId,
    });

    return {
      candidateId,
      familyId: family.id,
      symbol: options.symbol,
      timeframe: options.timeframe,
      params,
      experimentConfig,
    };
  });
}

/**
 * Normalize family ID lookup to match either kebab-case ('momentum-breakout') or camelCase ('momentumBreakout').
 */
function normalizeFamilyId(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Generate candidate configurations across all strategy families prioritized by research history.
 */
export function generateAllCandidateConfigs(
  registry: StrategyFamilyRegistry,
  options: GenerateCandidatesOptions,
): CandidateAlphaConfig[] {
  const families = options.verdictSummary
    ? prioritizeFamilies(registry, options.verdictSummary, { policy: options.policy })
        .map((p) => registry.get(p.familyId))
        .filter((f): f is StrategyFamily => f !== undefined)
    : registry.list();

  const normalizedFilter = options.familyIds?.map(normalizeFamilyId);

  const selectedFamilies = normalizedFilter
    ? families.filter((f) => normalizedFilter.includes(normalizeFamilyId(f.id)))
    : families;

  const allCandidates: CandidateAlphaConfig[] = [];
  for (const family of selectedFamilies) {
    const candidates = generateFamilyCandidates(family, registry, options);
    allCandidates.push(...candidates);
  }

  return allCandidates;
}

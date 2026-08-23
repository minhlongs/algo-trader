/**
 * Strategy Family Registry — Phase 11
 *
 * Provides lookup and enumeration over the defined strategy families,
 * plus a factory that builds an ExperimentConfig from a family.
 */

import type { StrategyFamily, StrategyFamilyRegistry, ExperimentFromFamilyOptions, StrategyCategory } from './strategy-family-types';
import type { ExperimentConfig, CostConfig } from '../experiments/experiment-types';
import { ALL_FAMILIES } from './strategy-families';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Build a registry from a list of families. */
export function createRegistry(families: StrategyFamily[]): StrategyFamilyRegistry {
  return {
    families,
    get: (id) => families.find((f) => f.id === id),
    list: () => [...families],
    byCategory: (cat: StrategyCategory) => families.filter((f) => f.category === cat),
  };
}

/** Convenience: registry with the four built-in families. */
export function createDefaultRegistry(): StrategyFamilyRegistry {
  return createRegistry(ALL_FAMILIES);
}

/**
 * Build an ExperimentConfig from a strategy family and caller-supplied options.
 * Default params are used when no overrides are given; out-of-range overrides
 * are clamped to the declared paramBounds.
 */
export function experimentFromFamily(
  registry: StrategyFamilyRegistry,
  options: ExperimentFromFamilyOptions,
): ExperimentConfig {
  const family = registry.get(options.familyId);
  if (!family) {
    throw new Error(`Unknown strategy family: ${options.familyId}`);
  }

  // Merge defaults with overrides, then clamp to bounds
  const params: Record<string, number> = {};
  for (const [key, defaultVal] of Object.entries(family.defaultParams)) {
    const raw = options.paramOverrides?.[key] ?? defaultVal;
    const bounds = family.paramBounds[key];
    params[key] = bounds ? clamp(raw, bounds.min, bounds.max) : raw;
  }

  const cost: CostConfig = {
    feeBps: options.feeBps ?? 5,
    slippageBps: options.slippageBps ?? 2,
    scenario: 'normal',
  };

  const config: ExperimentConfig = {
    experimentId: `${family.id}-${options.symbol.toLowerCase()}-${options.timeframe}`,
    hypothesis: family.description,
    symbol: options.symbol,
    timeframe: options.timeframe,
    features: family.features,
    regimes: options.regimes ?? 'all',
    tp: params.takeProfitBps ? params.takeProfitBps / 10_000 : 0.02,
    sl: params.stopLossBps ? params.stopLossBps / 10_000 : 0.01,
    maxHolding: params.maxHoldBars ?? params.exitLookback ?? 24,
    lookback: params.breakoutLookback ?? params.atrLookback ?? 20,
    split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
    cost,
    seed: options.seed ?? 42,
    gitCommit: 'dev',
    createdAt: new Date().toISOString(),
  };

  return Object.freeze(config) as ExperimentConfig;
}
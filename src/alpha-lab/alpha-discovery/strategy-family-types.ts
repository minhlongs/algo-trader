/**
 * Strategy Family Types — Phase 11
 *
 * Named strategy families that the experiment engine can instantiate.
 * Each family declares the features, entry/exit rules, and parameter bounds
 * needed to build a reproducible ExperimentConfig.
 */

import type { MarketRegime } from '../regimes/regime-types';

/** Categories of strategy families. */
export type StrategyCategory = 'momentum' | 'mean-reversion' | 'breakout' | 'volatility';

/** Position sizing strategies supported by the experiment engine. */
export type PositionSizing = 'fixed-fraction' | 'kelly' | 'equal-risk';

/**
 * A named strategy family. Pure data — no execution logic.
 * The experiment engine interprets these fields when building a config.
 */
export interface StrategyFamily {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
  features: string[];
  entryRule: string;
  exitRule: string;
  positionSizing: PositionSizing;
  defaultParams: Record<string, number>;
  paramBounds: Record<string, { min: number; max: number; step?: number }>;
}

/** Registry of strategy families with lookup helpers. */
export interface StrategyFamilyRegistry {
  families: StrategyFamily[];
  get(id: string): StrategyFamily | undefined;
  list(): StrategyFamily[];
  byCategory(category: StrategyCategory): StrategyFamily[];
}

/** Options for building an experiment from a strategy family. */
export interface ExperimentFromFamilyOptions {
  familyId: string;
  symbol: string;
  timeframe: string;
  paramOverrides?: Partial<Record<string, number>>;
  feeBps?: number;
  slippageBps?: number;
  seed?: number;
  regimes?: 'all' | MarketRegime[];
}
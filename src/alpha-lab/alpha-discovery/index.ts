/**
 * Alpha Discovery — public barrel export.
 */

export {
  prioritizeFamilies,
} from './research-informed';
export type {
  PrioritizationPolicy,
  PrioritizeOptions,
  PrioritizedFamily,
} from './research-informed';

export {
  createDefaultRegistry,
  createRegistry,
  experimentFromFamily,
} from './strategy-family-registry';

export type {
  StrategyFamily,
  StrategyFamilyRegistry,
  ExperimentFromFamilyOptions,
  StrategyCategory,
  PositionSizing,
} from './strategy-family-types';

export { ALL_FAMILIES } from './strategy-families';

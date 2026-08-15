/**
 * Meta-Ensemble module — public API barrel.
 */

export {
  adaptiveFuse,
  resetAdaptiveFusionState,
  type AdaptiveFusionOptions,
  type AdaptiveFusionResult,
} from './adaptive-fusion';

export {
  configureMetaLearner,
  getOptimalWeights,
  getMetaStats,
  refreshCache,
  type MetaWeight,
  type MetaLearnerConfig,
} from './meta-learner';

/**
 * Gate Evaluator
 *
 * Loads paper trades, computes metrics via computeMetrics, then checks
 * all 10 transition-criteria gates from docs/transition-criteria.md.
 * Returns structured GateStatus per gate with pass/fail and current value.
 *
 * Decomposed into modular submodules. Re-exports 100% public contracts.
 */

export type { GateEvaluatorInput } from './gate-evaluator-types';

export {
  evaluateNumericGate,
  evaluateOosGate,
  evaluateBooleanGate,
  evaluateStatisticalGate,
  computeDaysSinceStart,
  computeOosGap,
  estimateDaysRemaining,
  formatValue,
  STATISTICAL_P_VALUE_THRESHOLD,
} from './gate-evaluator-rules';

export { evaluateGates } from './gate-evaluator-core';

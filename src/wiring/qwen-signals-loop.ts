/**
 * Re-export from canonical path.
 * Source of truth: src/desk/wiring/qwen-signals-loop.ts
 */
export {
  QualityMetrics,
  computeQualityMetrics,
  persistRunJournal,
  emitReviewBacklogGauges,
  evaluateAndQueue,
  startSignalsLoop,
  stopSignalsLoop,
  resetSignalsLoop,
} from '../desk/wiring/qwen-signals-loop';

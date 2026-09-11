/**
 * Prediction Accuracy Reporter — Computes statistics, rankings, and console prints
 */

import { logger } from '../../shared/utils/logger';
import {
  Prediction,
  AccuracyReport,
  StrategyAccuracy,
  loadPredictions,
} from './prediction-accuracy-types';

/** Bucket confidence to nearest 10% range e.g. "0.7-0.8" */
export function confidenceBucket(c: number): string {
  const lo = Math.floor(c * 10) / 10;
  const hi = Math.min(lo + 0.1, 1.0);
  return `${lo.toFixed(1)}-${hi.toFixed(1)}`;
}

/** Compute full accuracy stats across all recorded predictions */
export function getAccuracyReport(): AccuracyReport {
  const predictions = loadPredictions();
  const resolved = predictions.filter(p => p.actualOutcome !== null);
  const correct = resolved.filter(p => p.correct === true);
  const incorrect = resolved.filter(p => p.correct === false);

  const byStrategy: AccuracyReport['byStrategy'] = {};
  const byConfidenceBucket: AccuracyReport['byConfidenceBucket'] = {};

  for (const p of resolved) {
    if (!byStrategy[p.strategy]) byStrategy[p.strategy] = { total: 0, correct: 0, winRate: 0 };
    byStrategy[p.strategy].total++;
    if (p.correct) byStrategy[p.strategy].correct++;

    const bucket = confidenceBucket(p.confidence);
    if (!byConfidenceBucket[bucket]) byConfidenceBucket[bucket] = { total: 0, correct: 0, winRate: 0 };
    byConfidenceBucket[bucket].total++;
    if (p.correct) byConfidenceBucket[bucket].correct++;
  }

  for (const v of Object.values(byStrategy)) v.winRate = v.total > 0 ? v.correct / v.total : 0;
  for (const v of Object.values(byConfidenceBucket)) v.winRate = v.total > 0 ? v.correct / v.total : 0;

  const avgConf = (subset: Prediction[]) =>
    subset.length > 0 ? subset.reduce((s, p) => s + p.confidence, 0) / subset.length : 0;

  return {
    totalPredictions: predictions.length,
    resolved: resolved.length,
    pending: predictions.length - resolved.length,
    correct: correct.length,
    incorrect: incorrect.length,
    winRate: resolved.length > 0 ? correct.length / resolved.length : 0,
    byStrategy,
    byConfidenceBucket,
    avgConfidenceWhenCorrect: avgConf(correct),
    avgConfidenceWhenIncorrect: avgConf(incorrect),
  };
}

/**
 * Extract per-strategy accuracy from the full report.
 * Only includes strategies with at least one resolved prediction.
 */
export function getAllStrategyAccuracy(): StrategyAccuracy[] {
  const report = getAccuracyReport();
  return Object.entries(report.byStrategy)
    .filter(([, s]) => s.total > 0)
    .map(([strategyName, s]) => ({
      strategyName,
      winRate: s.winRate,
      totalTrades: s.total,
      lastUpdated: new Date().toISOString(),
    }));
}

/** Print formatted accuracy report to logger (info level) */
export function printAccuracyReport(): void {
  const r = getAccuracyReport();
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  logger.info('=== PREDICTION ACCURACY REPORT ===');
  logger.info(`Total: ${r.totalPredictions} | Resolved: ${r.resolved} | Pending: ${r.pending}`);
  logger.info(`Correct: ${r.correct} | Incorrect: ${r.incorrect} | Win Rate: ${pct(r.winRate)}`);
  logger.info(`Avg confidence (correct): ${pct(r.avgConfidenceWhenCorrect)} | (incorrect): ${pct(r.avgConfidenceWhenIncorrect)}`);

  if (Object.keys(r.byStrategy).length > 0) {
    logger.info('--- By Strategy ---');
    for (const [strat, s] of Object.entries(r.byStrategy)) {
      logger.info(`  ${strat}: ${s.correct}/${s.total} (${pct(s.winRate)})`);
    }
  }

  if (Object.keys(r.byConfidenceBucket).length > 0) {
    logger.info('--- By Confidence Bucket ---');
    for (const [bucket, s] of Object.entries(r.byConfidenceBucket).sort()) {
      logger.info(`  [${bucket}]: ${s.correct}/${s.total} (${pct(s.winRate)})`);
    }
  }

  logger.info('==================================');
}

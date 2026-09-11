/**
 * Prediction Accuracy Tracker
 * Records bot predictions vs actual Polymarket resolutions — no money required.
 * Persists to data/predictions.json. Resolution checker polls Gamma API every 5 min.
 *
 * Flow:
 *   recordPrediction() → data/predictions.json (append)
 *   checkResolutions() → Gamma API closed markets → update actualOutcome / correct
 *   getAccuracyReport() → AccuracyReport (win rate, by strategy, by confidence bucket)
 *   startResolutionChecker() → background interval polling
 *   printAccuracyReport() → formatted console output
 */

import { logger } from '../../shared/utils/logger';
import { upsertPredictionPg, updatePredictionResolutionPg } from './prediction-pg-store';
import {
  Prediction,
  AccuracyReport,
  StrategyAccuracy,
  GammaMarket,
  GAMMA_API_URL,
  loadPredictions,
  savePredictions,
} from './prediction-accuracy-types';
import {
  getAccuracyReport,
  getAllStrategyAccuracy,
  printAccuracyReport,
} from './prediction-accuracy-reporter';

export type { Prediction, AccuracyReport, StrategyAccuracy };
export { getAccuracyReport, getAllStrategyAccuracy, printAccuracyReport };

/** Append a new prediction to data/predictions.json + PostgreSQL dual-write */
export function recordPrediction(prediction: Prediction): void {
  const predictions = loadPredictions();
  const idx = predictions.findIndex(p => p.id === prediction.id);
  if (idx >= 0) {
    predictions[idx] = prediction;
  } else {
    predictions.push(prediction);
  }
  savePredictions(predictions);

  // Dual-write to PostgreSQL (fire-and-forget — failures logged, never block)
  upsertPredictionPg(prediction).catch((err) => {
    logger.debug('[AccuracyTracker] PG dual-write failed', { id: prediction.id, err });
  });

  logger.info('[AccuracyTracker] Prediction recorded', {
    id: prediction.id,
    market: prediction.title,
    predicted: prediction.predictedOutcome,
    confidence: prediction.confidence,
    strategy: prediction.strategy,
  });
}

/** Fetch resolved markets from Gamma API and update pending predictions */
export async function checkResolutions(): Promise<number> {
  const predictions = loadPredictions();
  const pending = predictions.filter(p => p.actualOutcome === null);
  if (pending.length === 0) {
    logger.debug('[AccuracyTracker] No pending predictions to check');
    return 0;
  }

  let resolvedCount = 0;
  try {
    const resp = await fetch(GAMMA_API_URL, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      logger.warn('[AccuracyTracker] Gamma API error', { status: resp.status });
      return 0;
    }

    const markets = (await resp.json()) as GammaMarket[];
    const resolvedMap = new Map<string, string>();
    for (const m of markets) {
      if (m.resolvedOutcome === 'YES' || m.resolvedOutcome === 'NO') {
        resolvedMap.set(m.id, m.resolvedOutcome);
      }
    }

    let changed = false;
    for (const pred of predictions) {
      if (pred.actualOutcome !== null) continue;
      const outcome = resolvedMap.get(pred.marketId);
      if (outcome === 'YES' || outcome === 'NO') {
        pred.actualOutcome = outcome;
        pred.resolvedAt = Date.now();
        pred.correct = pred.predictedOutcome === outcome;
        resolvedCount++;
        changed = true;

        updatePredictionResolutionPg(pred.id, outcome, pred.correct).catch(() => {});

        logger.info('[AccuracyTracker] Prediction resolved', {
          id: pred.id,
          predicted: pred.predictedOutcome,
          actual: outcome,
          correct: pred.correct,
        });
      }
    }

    if (changed) savePredictions(predictions);
  } catch (err) {
    logger.error('[AccuracyTracker] Resolution check failed', { err });
  }

  return resolvedCount;
}

/** Start a background resolution checker. Returns the interval handle for cleanup. */
export function startResolutionChecker(intervalMs = 300_000): NodeJS.Timeout {
  logger.info('[AccuracyTracker] Starting resolution checker', { intervalMs });

  // Run once immediately, then on schedule
  checkResolutions().catch(err => logger.error('[AccuracyTracker] Initial check failed', { err }));

  return setInterval(() => {
    checkResolutions().catch(err => logger.error('[AccuracyTracker] Scheduled check failed', { err }));
  }, intervalMs);
}

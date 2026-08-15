/**
 * Prediction PG Store — PostgreSQL dual-write for predictions.
 * Provides async insert/upsert for the prediction_history table.
 * Used alongside the flat-file predictions.json during migration.
 */

import { query } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { Prediction } from './prediction-accuracy-tracker';

/** Insert or update a single prediction in prediction_history */
export async function upsertPredictionPg(pred: Prediction): Promise<void> {
  try {
    await query(
      `INSERT INTO prediction_history
        (id, market_id, title, predicted_outcome, confidence, predicted_at,
         market_yes_price, strategy, actual_outcome, resolved_at, correct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         actual_outcome = COALESCE(EXCLUDED.actual_outcome, prediction_history.actual_outcome),
         resolved_at = COALESCE(EXCLUDED.resolved_at, prediction_history.resolved_at),
         correct = COALESCE(EXCLUDED.correct, prediction_history.correct),
         updated_at = NOW()`,
      [
        pred.id,
        pred.marketId,
        pred.title,
        pred.predictedOutcome,
        pred.confidence,
        pred.predictedAt,
        pred.marketYesPrice,
        pred.strategy,
        pred.actualOutcome,
        pred.resolvedAt,
        pred.correct,
      ],
    );
  } catch (err) {
    logger.warn('[PredictionPG] Upsert failed — falling back to JSON', {
      id: pred.id,
      err,
    });
  }
}

/** Batch upsert predictions to PostgreSQL */
export async function batchUpsertPredictionsPg(preds: Prediction[]): Promise<void> {
  for (const pred of preds) {
    await upsertPredictionPg(pred);
  }
}

/** Update resolution fields for a prediction in PostgreSQL */
export async function updatePredictionResolutionPg(
  id: string,
  actualOutcome: 'YES' | 'NO',
  correct: boolean,
): Promise<void> {
  try {
    await query(
      `UPDATE prediction_history
       SET actual_outcome = $2, correct = $3, resolved_at = $4, updated_at = NOW()
       WHERE id = $1`,
      [id, actualOutcome, correct, Date.now()],
    );
  } catch (err) {
    logger.warn('[PredictionPG] Resolution update failed', { id, err });
  }
}

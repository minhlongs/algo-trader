/**
 * A/B Test Manager — experiment CRUD, group assignment, outcome tracking.
 * Statistical helpers live in ab-test-stats.ts.
 * Shared row shapes and pure reductions live in ab-test-model.ts.
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { computeSignificance, buildRecommendation } from './ab-test-stats';
import {
  EXPERIMENT_SELECT_COLS,
  computeGroupStats,
  hashSignalId,
  type Experiment,
  type ExperimentResult,
  type ExperimentStatus,
  type GroupName,
  type GroupStats,
  type OutcomeRow,
} from './ab-test-model';

export type { ExperimentStatus, GroupName, Experiment, GroupStats, ExperimentResult };

/** Traffic share (percent) assigned to treatment when the caller omits one. */
const DEFAULT_TRAFFIC_PCT = 50;

/** Sample count a completed experiment must reach per arm. */
const DEFAULT_MIN_SAMPLES = 30;

/** Confidence level for significance testing. */
const DEFAULT_CONFIDENCE_LEVEL = 0.95;

export async function createExperiment(params: {
  name: string; description?: string; controlName: string;
  treatmentName: string; trafficPct?: number; minSamples?: number;
  confidenceLevel?: number;
}): Promise<Experiment> {
  const pool = getDbClient();
  const result = await pool.query<{ id: number }>(
    `INSERT INTO ab_test_experiments
       (name, description, control_name, treatment_name, traffic_pct, min_samples, confidence_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [params.name, params.description ?? null, params.controlName,
     params.treatmentName, params.trafficPct ?? DEFAULT_TRAFFIC_PCT,
     params.minSamples ?? DEFAULT_MIN_SAMPLES, params.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL],
  );
  logger.info(`[ABTest] Created "${params.name}" (id=${result.rows[0].id})`, 'ABTestManager');
  return getExperiment(result.rows[0].id);
}

export async function startExperiment(id: number): Promise<Experiment> {
  const pool = getDbClient();
  await pool.query(
    `UPDATE ab_test_experiments SET status='running', started_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='draft'`, [id],
  );
  return getExperiment(id);
}

export async function assignGroup(
  experimentId: number, signalId: string,
): Promise<{ group: GroupName; alreadyAssigned: boolean }> {
  const pool = getDbClient();
  const existing = await pool.query<{ group_name: GroupName }>(
    `SELECT group_name FROM ab_test_assignments WHERE experiment_id=$1 AND signal_id=$2`,
    [experimentId, signalId],
  );
  if (existing.rows.length > 0) {
    return { group: existing.rows[0].group_name, alreadyAssigned: true };
  }
  const exp = await getExperiment(experimentId);
  const group: GroupName = hashSignalId(signalId) % 100 < exp.trafficPct ? 'treatment' : 'control';
  await pool.query(
    `INSERT INTO ab_test_assignments (experiment_id, signal_id, group_name)
     VALUES ($1,$2,$3) ON CONFLICT (experiment_id, signal_id) DO NOTHING`,
    [experimentId, signalId, group],
  );
  return { group, alreadyAssigned: false };
}

export async function recordOutcome(
  experimentId: number, signalId: string, group: GroupName,
  correct: boolean, confidence?: number, pnl?: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const pool = getDbClient();
  await pool.query(
    `INSERT INTO ab_test_outcomes
       (experiment_id, signal_id, group_name, correct, confidence, pnl, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (experiment_id, signal_id) DO UPDATE SET
       correct=EXCLUDED.correct, confidence=EXCLUDED.confidence,
       pnl=EXCLUDED.pnl, metadata=EXCLUDED.metadata, recorded_at=NOW()`,
    [experimentId, signalId, group, correct,
     confidence ?? null, pnl ?? 0, metadata ? JSON.stringify(metadata) : null],
  );
}

export async function getResults(experimentId: number): Promise<ExperimentResult> {
  const experiment = await getExperiment(experimentId);
  const pool = getDbClient();
  const outcomes = await pool.query<OutcomeRow>(
    `SELECT group_name, correct, confidence, pnl FROM ab_test_outcomes WHERE experiment_id=$1`,
    [experimentId],
  );
  const control = computeGroupStats('control', outcomes.rows.filter(r => r.group_name === 'control'));
  const treatment = computeGroupStats('treatment', outcomes.rows.filter(r => r.group_name === 'treatment'));
  const { pValue, significant } = computeSignificance(control, treatment, experiment.confidenceLevel);
  const winner: GroupName | null = significant
    ? (treatment.accuracy > control.accuracy ? 'treatment' : 'control')
    : null;
  return {
    experiment, control, treatment, pValue, significant, winner,
    recommendation: buildRecommendation(control, treatment, significant, winner, experiment.minSamples),
  };
}

export async function listExperiments(): Promise<Experiment[]> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${EXPERIMENT_SELECT_COLS} FROM ab_test_experiments ORDER BY created_at DESC`,
  );
  return result.rows.map(r => r as unknown as Experiment);
}

async function getExperiment(id: number): Promise<Experiment> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${EXPERIMENT_SELECT_COLS} FROM ab_test_experiments WHERE id=$1`, [id],
  );
  if (result.rows.length === 0) throw new Error(`Experiment ${id} not found`);
  return result.rows[0] as unknown as Experiment;
}

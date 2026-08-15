/**
 * A/B Test Manager — experiment CRUD, group assignment, outcome tracking.
 * Statistical helpers live in ab-test-stats.ts.
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { computeSignificance, buildRecommendation } from './ab-test-stats';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';
export type GroupName = 'control' | 'treatment';

export interface Experiment {
  id: number; name: string; description: string | null;
  controlName: string; treatmentName: string; status: ExperimentStatus;
  trafficPct: number; minSamples: number; confidenceLevel: number;
  startedAt: Date | null; endedAt: Date | null; createdAt: Date;
}

export interface GroupStats {
  name: string; total: number; correct: number;
  accuracy: number; avgConfidence: number; avgPnl: number;
}

export interface ExperimentResult {
  experiment: Experiment; control: GroupStats; treatment: GroupStats;
  pValue: number; significant: boolean; winner: GroupName | null;
  recommendation: string;
}

interface OutcomeRow {
  group_name: string; correct: boolean;
  confidence: string | null; pnl: string | null;
}

const SELECT_COLS = `id, name, description, control_name as "controlName",
  treatment_name as "treatmentName", status, traffic_pct as "trafficPct",
  min_samples as "minSamples", confidence_level as "confidenceLevel",
  started_at as "startedAt", ended_at as "endedAt", created_at as "createdAt"`;

/** Create a new experiment in draft status */
export async function createExperiment(params: {
  name: string; description?: string; controlName: string;
  treatmentName: string; trafficPct?: number; minSamples?: number;
  confidenceLevel?: number;
}): Promise<Experiment> {
  const pool = getDbClient();
  const result = await pool.query<{ id: number }>(
    `INSERT INTO ab_test_experiments
       (name, description, control_name, treatment_name,
        traffic_pct, min_samples, confidence_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [params.name, params.description ?? null, params.controlName,
     params.treatmentName, params.trafficPct ?? 50,
     params.minSamples ?? 30, params.confidenceLevel ?? 0.95],
  );
  logger.info(`[ABTest] Created "${params.name}" (id=${result.rows[0].id})`, 'ABTestManager');
  return getExperiment(result.rows[0].id);
}

/** Start an experiment (draft -> running) */
export async function startExperiment(id: number): Promise<Experiment> {
  const pool = getDbClient();
  await pool.query(
    `UPDATE ab_test_experiments SET status='running', started_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='draft'`, [id],
  );
  return getExperiment(id);
}

/** Deterministic hash-based group assignment */
export async function assignGroup(
  experimentId: number, signalId: string,
): Promise<{ group: GroupName; alreadyAssigned: boolean }> {
  const pool = getDbClient();
  const existing = await pool.query<{ group_name: GroupName }>(
    `SELECT group_name FROM ab_test_assignments
     WHERE experiment_id=$1 AND signal_id=$2`, [experimentId, signalId],
  );
  if (existing.rows.length > 0) {
    return { group: existing.rows[0].group_name, alreadyAssigned: true };
  }
  const hash = simpleHash(signalId);
  const exp = await getExperiment(experimentId);
  const group: GroupName = hash % 100 < exp.trafficPct ? 'treatment' : 'control';
  await pool.query(
    `INSERT INTO ab_test_assignments (experiment_id, signal_id, group_name)
     VALUES ($1,$2,$3) ON CONFLICT (experiment_id, signal_id) DO NOTHING`,
    [experimentId, signalId, group],
  );
  return { group, alreadyAssigned: false };
}

/** Record an outcome for a signal */
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

/** Get results with statistical significance */
export async function getResults(experimentId: number): Promise<ExperimentResult> {
  const experiment = await getExperiment(experimentId);
  const pool = getDbClient();
  const outcomes = await pool.query<OutcomeRow>(
    `SELECT group_name, correct, confidence, pnl FROM ab_test_outcomes WHERE experiment_id=$1`,
    [experimentId],
  );
  const ctrl = outcomes.rows.filter(r => r.group_name === 'control');
  const treat = outcomes.rows.filter(r => r.group_name === 'treatment');
  const control = computeGroupStats('control', ctrl);
  const treatment = computeGroupStats('treatment', treat);
  const { pValue, significant } = computeSignificance(control, treatment, experiment.confidenceLevel);
  const winner = significant
    ? (treatment.accuracy > control.accuracy ? 'treatment' as const : 'control' as const)
    : null;
  return {
    experiment, control, treatment, pValue, significant, winner,
    recommendation: buildRecommendation(control, treatment, significant, winner, experiment.minSamples),
  };
}

/** List all experiments */
export async function listExperiments(): Promise<Experiment[]> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM ab_test_experiments ORDER BY created_at DESC`,
  );
  return result.rows.map(r => r as unknown as Experiment);
}

// ─── Private ───────────────────────────────────────────────────────────

async function getExperiment(id: number): Promise<Experiment> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM ab_test_experiments WHERE id=$1`, [id],
  );
  if (result.rows.length === 0) throw new Error(`Experiment ${id} not found`);
  return result.rows[0] as unknown as Experiment;
}

function computeGroupStats(name: string, rows: OutcomeRow[]): GroupStats {
  const total = rows.length;
  const correct = rows.filter(r => r.correct).length;
  const sumConf = rows.reduce((a, r) => a + (r.confidence ? parseFloat(r.confidence) : 0), 0);
  const sumPnl = rows.reduce((a, r) => a + (r.pnl ? parseFloat(r.pnl) : 0), 0);
  return {
    name, total, correct,
    accuracy: total > 0 ? correct / total : 0,
    avgConfidence: total > 0 ? sumConf / total : 0,
    avgPnl: total > 0 ? sumPnl / total : 0,
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

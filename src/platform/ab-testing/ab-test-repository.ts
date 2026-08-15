/**
 * A/B Test Repository
 * Data access layer for A/B test experiment database operations.
 * Extracted from ab-test-manager.ts for clean separation of concerns.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { Experiment, ExperimentStatus, GroupName } from './ab-test-manager';

/* ── row types ─────────────────────────────────────────── */

export interface OutcomeRow {
  [key: string]: string | number | boolean | Date | null | undefined;
  group_name: string;
  correct: boolean;
  confidence: string | null;
  pnl: string | null;
}

// Using unknown for index signature to allow arrays and nested types from pg
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgRow = Record<string, any>;

/* ── SQL constants ─────────────────────────────────────── */

const SELECT_COLS = `id, name, description, control_name as "controlName",
  treatment_name as "treatmentName", status, traffic_pct as "trafficPct",
  min_samples as "minSamples", confidence_level as "confidenceLevel",
  started_at as "startedAt", ended_at as "endedAt", created_at as "createdAt"`;

/* ── repository class ──────────────────────────────────── */

export class AbTestRepository {
  // ── Experiment CRUD ────────────────────────────────────────

  async createExperiment(params: {
    name: string;
    description: string | null;
    controlName: string;
    treatmentName: string;
    trafficPct?: number;
    minSamples?: number;
    confidenceLevel?: number;
  }): Promise<number> {
    const result = await query<{ id: number }>(
      `INSERT INTO ab_test_experiments
         (name, description, control_name, treatment_name, status, traffic_pct, min_samples, confidence_level)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7)
       RETURNING id`,
      [params.name, params.description, params.controlName, params.treatmentName,
       params.trafficPct ?? 50, params.minSamples ?? 30, params.confidenceLevel ?? 0.95],
    );
    return result.rows[0].id;
  }

  async getExperiment(id: number): Promise<Experiment | null> {
    const result = await query<PgRow>(
      `SELECT ${SELECT_COLS} FROM ab_test_experiments WHERE id=$1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as unknown as Experiment;
  }

  async startExperiment(id: number): Promise<void> {
    await query(
      `UPDATE ab_test_experiments
       SET status='running', started_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='draft'`,
      [id],
    );
  }

  async pauseExperiment(id: number): Promise<void> {
    await query(
      `UPDATE ab_test_experiments
       SET status='paused', updated_at=NOW()
       WHERE id=$1 AND status='running'`,
      [id],
    );
  }

  async completeExperiment(id: number): Promise<void> {
    await query(
      `UPDATE ab_test_experiments
       SET status='completed', completed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status IN ('running','paused')`,
      [id],
    );
  }

  async listExperiments(): Promise<Experiment[]> {
    const result = await query<PgRow>(
      `SELECT ${SELECT_COLS} FROM ab_test_experiments ORDER BY created_at DESC`,
    );
    return result.rows.map(r => r as unknown as Experiment);
  }

  // ── Group Assignment ──────────────────────────────────────

  async getAssignment(experimentId: number, signalId: string): Promise<GroupName | null> {
    const result = await query<{ group_name: GroupName }>(
      `SELECT group_name FROM ab_test_assignments
       WHERE experiment_id=$1 AND signal_id=$2`,
      [experimentId, signalId],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].group_name;
  }

  async createAssignment(experimentId: number, signalId: string, group: GroupName): Promise<void> {
    await query(
      `INSERT INTO ab_test_assignments (experiment_id, signal_id, group_name)
       VALUES ($1,$2,$3)`,
      [experimentId, signalId, group],
    );
  }

  // ── Outcomes ──────────────────────────────────────────────

  async recordOutcome(params: {
    experimentId: number;
    signalId: string;
    group: GroupName;
    correct: boolean;
    confidence?: number | null;
    pnl?: number;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await query(
      `INSERT INTO ab_test_outcomes
         (experiment_id, signal_id, group_name, correct, confidence, pnl, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (experiment_id, signal_id) DO UPDATE SET
         correct=EXCLUDED.correct, confidence=EXCLUDED.confidence,
         pnl=EXCLUDED.pnl, metadata=EXCLUDED.metadata, recorded_at=NOW()`,
      [params.experimentId, params.signalId, params.group, params.correct,
       params.confidence ?? null, params.pnl ?? 0, params.metadata ? JSON.stringify(params.metadata) : null],
    );
  }

  async getOutcomes(experimentId: number): Promise<OutcomeRow[]> {
    const result = await query<OutcomeRow>(
      `SELECT group_name, correct, confidence, pnl FROM ab_test_outcomes WHERE experiment_id=$1`,
      [experimentId],
    );
    return result.rows;
  }
}

/* ── singleton export ──────────────────────────────────── */

export const abTestRepository = new AbTestRepository();
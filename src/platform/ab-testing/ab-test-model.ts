/**
 * A/B Test Model
 *
 * Shared experiment types, the column list used by every experiment SELECT, and
 * the pure helpers that reduce outcome rows into per-group statistics. Used by
 * both the manager and the repository so the row shape and column aliases are
 * defined once.
 */

/** Lifecycle state of an experiment. */
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

/** Which arm of an experiment a signal was assigned to. */
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

/** Significance test outcome plus the winning arm for a completed experiment. */
export interface ExperimentResult {
  experiment: Experiment; control: GroupStats; treatment: GroupStats;
  pValue: number; significant: boolean; winner: GroupName | null;
  recommendation: string;
}

/** One recorded outcome row, with numeric columns as returned by pg (strings). */
export interface OutcomeRow {
  group_name: string; correct: boolean;
  confidence: string | null; pnl: string | null;
}

/**
 * Column list for experiment SELECTs. Aliases snake_case columns to the
 * camelCase shape of `Experiment` so callers can cast rows directly.
 */
export const EXPERIMENT_SELECT_COLS = `id, name, description, control_name as "controlName",
  treatment_name as "treatmentName", status, traffic_pct as "trafficPct",
  min_samples as "minSamples", confidence_level as "confidenceLevel",
  started_at as "startedAt", ended_at as "endedAt", created_at as "createdAt"`;

/** Reduce a group's outcome rows to summary statistics (empty group → zeroes). */
export function computeGroupStats(name: string, rows: OutcomeRow[]): GroupStats {
  const total = rows.length;
  const correct = rows.filter(r => r.correct).length;
  const sumConf = rows.reduce((a, r) => a + (r.confidence ? parseFloat(r.confidence) : 0), 0);
  const sumPnl = rows.reduce((a, r) => a + (r.pnl ? parseFloat(r.pnl) : 0), 0);
  return {
    name, total, correct, accuracy: total > 0 ? correct / total : 0,
    avgConfidence: total > 0 ? sumConf / total : 0, avgPnl: total > 0 ? sumPnl / total : 0,
  };
}

/**
 * Stable non-negative hash of a signal id, used to bucket assignments.
 *
 * Same id → same bucket across calls, so a re-assigned signal lands in the
 * same arm. Absolute value avoids the sign bit on overflow.
 */
export function hashSignalId(signalId: string): number {
  let hash = 0;
  for (let i = 0; i < signalId.length; i++) hash = ((hash << 5) - hash + signalId.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/**
 * Model Registry
 *
 * Tracks versioned ML model artifacts with metrics, training data hashes,
 * and deployment status. Enables model comparison and rollback.
 *
 * Supports: meta-learner, gru, kronos, rl, and custom model types.
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';

export type ModelStatus = 'registered' | 'staging' | 'production' | 'archived' | 'failed';

export interface ModelRecord {
  id: number;
  modelName: string;
  version: string;
  status: ModelStatus;
  description: string | null;
  metrics: Record<string, number>;
  trainingDataHash: string | null;
  artifactPath: string | null;
  hyperparameters: Record<string, unknown>;
  modelType: string | null;
  registeredBy: string | null;
  promotedAt: Date | null;
  createdAt: Date;
}

export interface VersionComparison {
  versions: ModelRecord[];
  bestByAccuracy: ModelRecord | null;
  bestByF1: ModelRecord | null;
}

/**
 * Register a new model version
 */
export async function registerModel(params: {
  modelName: string;
  version: string;
  description?: string;
  metrics?: Record<string, number>;
  trainingDataHash?: string;
  artifactPath?: string;
  hyperparameters?: Record<string, unknown>;
  modelType?: string;
  registeredBy?: string;
}): Promise<ModelRecord> {
  const pool = getDbClient();
  const result = await pool.query<{ id: number }>(
    `INSERT INTO model_registry
       (model_name, version, description, metrics, training_data_hash,
        artifact_path, hyperparameters, model_type, registered_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      params.modelName, params.version, params.description ?? null,
      JSON.stringify(params.metrics ?? {}),
      params.trainingDataHash ?? null, params.artifactPath ?? null,
      JSON.stringify(params.hyperparameters ?? {}),
      params.modelType ?? null, params.registeredBy ?? null,
    ],
  );
  logger.info(
    `[ModelRegistry] Registered ${params.modelName}@${params.version} (id=${result.rows[0].id})`,
    'ModelRegistry',
  );
  return getModelById(result.rows[0].id);
}

/** Get the latest version of a model by name */
export async function getLatestVersion(
  modelName: string,
  status?: ModelStatus,
): Promise<ModelRecord | null> {
  const pool = getDbClient();
  const statusClause = status ? `AND status = $3` : '';
  const params: (string | number)[] = [modelName];
  if (status) params.push(status);
  params.push(1);
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM model_registry
     WHERE model_name = $1 ${statusClause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

/** Get all versions of a model */
export async function getModelVersions(modelName: string): Promise<ModelRecord[]> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM model_registry WHERE model_name = $1 ORDER BY created_at DESC`,
    [modelName],
  );
  return result.rows.map(mapRow);
}

/** Compare two or more versions side by side */
export async function compareVersions(
  modelName: string,
  versions: string[],
): Promise<VersionComparison> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM model_registry
     WHERE model_name = $1 AND version = ANY($2)
     ORDER BY created_at DESC`,
    [modelName, versions],
  );
  const records = result.rows.map(mapRow);
  const bestByAccuracy = findBest(records, 'accuracy');
  const bestByF1 = findBest(records, 'f1');
  return { versions: records, bestByAccuracy, bestByF1 };
}

/** Promote a model version to production (demotes previous) */
export async function promoteModel(
  modelName: string, version: string,
): Promise<ModelRecord> {
  const pool = getDbClient();
  await pool.query(
    `UPDATE model_registry SET status='archived', updated_at=NOW()
     WHERE model_name=$1 AND status='production'`, [modelName],
  );
  await pool.query(
    `UPDATE model_registry SET status='production', promoted_at=NOW(), updated_at=NOW()
     WHERE model_name=$1 AND version=$2`, [modelName, version],
  );
  logger.info(`[ModelRegistry] Promoted ${modelName}@${version} to production`, 'ModelRegistry');
  return getModelById(
    (await pool.query<{ id: number }>(
      `SELECT id FROM model_registry WHERE model_name=$1 AND version=$2`,
      [modelName, version],
    )).rows[0].id,
  );
}

// ─── Private Helpers ───────────────────────────────────────────────────

async function getModelById(id: number): Promise<ModelRecord> {
  const pool = getDbClient();
  const result = await pool.query<Record<string, unknown>>(
    'SELECT * FROM model_registry WHERE id=$1', [id],
  );
  if (result.rows.length === 0) throw new Error(`Model record ${id} not found`);
  return mapRow(result.rows[0]);
}

function mapRow(row: Record<string, unknown>): ModelRecord {
  return {
    id: row.id as number,
    modelName: row.model_name as string,
    version: row.version as string,
    status: row.status as ModelStatus,
    description: row.description as string | null,
    metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : (row.metrics as Record<string, number>) ?? {},
    trainingDataHash: row.training_data_hash as string | null,
    artifactPath: row.artifact_path as string | null,
    hyperparameters: typeof row.hyperparameters === 'string'
      ? JSON.parse(row.hyperparameters) : (row.hyperparameters as Record<string, unknown>) ?? {},
    modelType: row.model_type as string | null,
    registeredBy: row.registered_by as string | null,
    promotedAt: row.promoted_at as Date | null,
    createdAt: row.created_at as Date,
  };
}

function findBest(records: ModelRecord[], metric: string): ModelRecord | null {
  let best: ModelRecord | null = null;
  let bestVal = -Infinity;
  for (const r of records) {
    const val = r.metrics[metric] ?? -Infinity;
    if (val > bestVal) { bestVal = val; best = r; }
  }
  return best;
}

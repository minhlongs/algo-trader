/**
 * AI Decision Audit Service
 * Immutable audit trail for AI/ML model predictions with hash chaining, batch writes, and query capabilities.
 *
 * Follows patterns from: ImmutableTradeAudit, TenantAuditLog
 */

import { logger } from '../../shared/utils/logger';
import { query, transaction, getDbClient } from '../../shared/db/postgres-client';
import { config } from '../../shared/config/env';

export interface AIPredictionLog {
  // Identifiers
  id: string;
  tenant_id: string;
  sequence_number: number;

  // Prediction
  prediction_timestamp: string;
  model_name: string;
  model_version: string;
  model_type: 'gru' | 'llm' | 'ensemble' | 'rule_based' | 'custom';

  // Input/Output
  input_features: Record<string, unknown>;
  prediction_result: Record<string, unknown>;
  confidence: number;

  // Context
  market_id?: string;
  strategy?: string;
  wallet_label?: string;

  // Hash chain
  hash: string;
  previous_hash: string | null;

  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIExplanation {
  id: string;
  prediction_id: string;
  explanation_type: 'shap' | 'lime' | 'llm_reasoning' | 'feature_importance' | 'counterfactual' | 'rule_extraction';
  explanation_data: Record<string, unknown>;
  feature_contributions?: Record<string, number>;
  top_features?: Array<{feature: string, contribution: number, rank: number}>;
  reasoning_text?: string;
  risk_factors?: string[];
  decision_rationale?: string;
  created_at: string;
}

export interface AIPredictionQueryFilters {
  tenant_id?: string;
  model_name?: string;
  model_version?: string;
  start_date?: string;
  end_date?: string;
  market_id?: string;
  min_confidence?: number;
  limit?: number;
  offset?: number;
}

export interface PredictionWithExplanations {
  prediction: AIPredictionLog;
  explanations: AIExplanation[];
}

export class AIDecisionAuditService {
  private static instance: AIDecisionAuditService;
  private sequenceCache: Map<string, number> = new Map();
  private hashCache: Map<string, string> = new Map();

  // Config
  private retentionDays: number = parseInt(config.AUDIT_RETENTION_DAYS || '2555', 10); // 7 years default
  private batchSize: number = parseInt(config.AUDIT_BATCH_SIZE || '100', 10);
  private batchTimeoutMs: number = 5000; // 5 seconds default

  // Batch write buffer
  private writeBuffer: AIPredictionLog[] = [];
  private bufferTimer: NodeJS.Timeout | null = null;
  private bufferLocked: boolean = false;

  private constructor() {
    // Start periodic flush timer
    this.scheduleBatchFlush();
  }

  static getInstance(): AIDecisionAuditService {
    if (!AIDecisionAuditService.instance) {
      AIDecisionAuditService.instance = new AIDecisionAuditService();
    }
    return AIDecisionAuditService.instance;
  }

  getRetentionDays(): number {
    return this.retentionDays;
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Log an AI model prediction with hash chaining
   * Async operation, buffered for batch writes
   */
  async logPrediction(
    tenantId: string,
    prediction: {
      modelName: string;
      modelVersion: string;
      modelType: 'gru' | 'llm' | 'ensemble' | 'rule_based' | 'custom';
      inputFeatures: Record<string, unknown>;
      predictionResult: Record<string, unknown>;
      confidence: number;
      marketId?: string;
      strategy?: string;
      walletLabel?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AIPredictionLog> {
    // Get last sequence and hash for this tenant
    const { lastSequence, lastHash } = await this.getLastSequenceAndHash(tenantId);

    const sequenceNumber = lastSequence + 1;
    const now = new Date();
    const createdAt = now.toISOString();

    // Construct entry without hash first
    const entryWithoutHash = {
      tenant_id: tenantId,
      sequence_number: sequenceNumber,
      prediction_timestamp: createdAt,
      model_name: prediction.modelName,
      model_version: prediction.modelVersion,
      model_type: prediction.modelType,
      input_features: prediction.inputFeatures,
      prediction_result: prediction.predictionResult,
      confidence: prediction.confidence,
      market_id: prediction.marketId,
      strategy: prediction.strategy,
      wallet_label: prediction.walletLabel,
      metadata: prediction.metadata || {},
      previous_hash: lastHash,
      created_at: createdAt,
    };

    // Compute hash
    const hash = this.computeHash(entryWithoutHash);

    const fullEntry: AIPredictionLog = {
      id: `pred_${tenantId}_${sequenceNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...entryWithoutHash,
      hash,
      previous_hash: lastHash,
    };

    // Update caches
    this.sequenceCache.set(tenantId, sequenceNumber);
    this.hashCache.set(tenantId, hash);

    // Add to buffer for batch write
    this.writeBuffer.push(fullEntry);

    // Schedule flush if buffer full or timer not set
    if (this.writeBuffer.length >= this.batchSize) {
      this.flushBuffer().catch(err => {
        logger.error('[AIAudit] Batch flush failed:', err);
      });
    } else if (!this.bufferTimer) {
      this.scheduleBatchFlush();
    }

    return fullEntry;
  }

  /**
   * Store explanation artifact linked to a prediction
   * Direct insert (no batching) as explanations are less frequent
   */
  async storeExplanation(
    predictionId: string,
    explanation: {
      type: AIExplanation['explanation_type'];
      data: Record<string, unknown>;
      featureContributions?: Record<string, number>;
      topFeatures?: Array<{feature: string, contribution: number, rank: number}>;
      reasoningText?: string;
      riskFactors?: string[];
      decisionRationale?: string;
    }
  ): Promise<AIExplanation> {
    const now = new Date().toISOString();

    const result = await query(
      `INSERT INTO ai_explanations (
        prediction_id, explanation_type, explanation_data,
        feature_contributions, top_features, reasoning_text,
        risk_factors, decision_rationale, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (prediction_id, explanation_type)
      DO UPDATE SET
        explanation_data = EXCLUDED.explanation_data,
        feature_contributions = EXCLUDED.feature_contributions,
        top_features = EXCLUDED.top_features,
        reasoning_text = EXCLUDED.reasoning_text,
        risk_factors = EXCLUDED.risk_factors,
        decision_rationale = EXCLUDED.decision_rationale,
        created_at = EXCLUDED.created_at
      RETURNING *`,
      [
        predictionId,
        explanation.type,
        JSON.stringify(explanation.data),
        explanation.featureContributions ? JSON.stringify(explanation.featureContributions) : null,
        explanation.topFeatures ? JSON.stringify(explanation.topFeatures) : null,
        explanation.reasoningText || null,
        explanation.riskFactors || null,
        explanation.decisionRationale || null,
        now,
      ]
    );

    const row = result.rows[0];
    return this.mapExplanationRow(row);
  }

  /**
   * Query predictions with filters
   */
  async queryPredictions(filters: AIPredictionQueryFilters): Promise<AIPredictionLog[]> {
    let sql = `
      SELECT id, tenant_id, sequence_number, prediction_timestamp,
             model_name, model_version, model_type, input_features,
             prediction_result, confidence, market_id, strategy, wallet_label,
             hash, previous_hash, metadata, created_at
      FROM ai_predictions
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.tenant_id) {
      sql += ` AND tenant_id = $${paramIdx++}`;
      params.push(filters.tenant_id);
    }
    if (filters.model_name) {
      sql += ` AND model_name = $${paramIdx++}`;
      params.push(filters.model_name);
    }
    if (filters.model_version) {
      sql += ` AND model_version = $${paramIdx++}`;
      params.push(filters.model_version);
    }
    if (filters.start_date) {
      sql += ` AND prediction_timestamp >= $${paramIdx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND prediction_timestamp <= $${paramIdx++}`;
      params.push(filters.end_date);
    }
    if (filters.market_id) {
      sql += ` AND market_id = $${paramIdx++}`;
      params.push(filters.market_id);
    }
    if (filters.min_confidence !== undefined) {
      sql += ` AND confidence >= $${paramIdx++}`;
      params.push(filters.min_confidence);
    }

    sql += ` ORDER BY prediction_timestamp DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${paramIdx++}`;
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += ` OFFSET $${paramIdx++}`;
      params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows.map(this.mapPredictionRow);
  }

  /**
   * Count predictions matching filters (for pagination)
   */
  async countPredictions(filters: Omit<AIPredictionQueryFilters, 'limit' | 'offset'>): Promise<number> {
    let sql = `
      SELECT COUNT(*) as total
      FROM ai_predictions
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.tenant_id) {
      sql += ` AND tenant_id = $${paramIdx++}`;
      params.push(filters.tenant_id);
    }
    if (filters.model_name) {
      sql += ` AND model_name = $${paramIdx++}`;
      params.push(filters.model_name);
    }
    if (filters.model_version) {
      sql += ` AND model_version = $${paramIdx++}`;
      params.push(filters.model_version);
    }
    if (filters.start_date) {
      sql += ` AND prediction_timestamp >= $${paramIdx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND prediction_timestamp <= $${paramIdx++}`;
      params.push(filters.end_date);
    }
    if (filters.market_id) {
      sql += ` AND market_id = $${paramIdx++}`;
      params.push(filters.market_id);
    }
    if (filters.min_confidence !== undefined) {
      sql += ` AND confidence >= $${paramIdx++}`;
      params.push(filters.min_confidence);
    }

    const result = await query(sql, params);
    const total = result.rows[0].total;
    return typeof total === 'number' ? total : parseInt(total as string, 10) || 0;
  }

  /**
   * Get single prediction by ID with explanations
   */
  async getPredictionWithExplanations(predictionId: string): Promise<PredictionWithExplanations | null> {
    const predResult = await query(
      `SELECT * FROM ai_predictions WHERE id = $1`,
      [predictionId]
    );

    if (predResult.rows.length === 0) {
      return null;
    }

    const explanationResult = await query(
      `SELECT * FROM ai_explanations WHERE prediction_id = $1 ORDER BY created_at DESC`,
      [predictionId]
    );

    return {
      prediction: this.mapPredictionRow(predResult.rows[0]),
      explanations: explanationResult.rows.map(this.mapExplanationRow),
    };
  }

  /**
   * Verify hash chain integrity for a tenant
   * Returns {valid: boolean, brokenAt?: number, reason?: string}
   */
  async verifyChainIntegrity(tenantId: string): Promise<{
    valid: boolean;
    brokenAt?: number;
    reason?: string;
  }> {
    const result = await query(
      `SELECT id, sequence_number, prediction_timestamp, model_name, model_version,
              input_features, prediction_result, confidence, market_id, strategy,
              wallet_label, hash, previous_hash, metadata, created_at
       FROM ai_predictions
       WHERE tenant_id = $1
       ORDER BY sequence_number ASC`,
      [tenantId]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return { valid: true };
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const seq = parseInt(row.sequence_number as string, 10);

      // Check sequence continuity
      if (seq !== i + 1) {
        return {
          valid: false,
          brokenAt: seq,
          reason: `Sequence gap: expected ${i + 1}, got ${seq}`,
        };
      }

      // Check previous hash linkage
      const prevHash = row.previous_hash as string | null;
      if (i === 0) {
        if (prevHash !== null && prevHash !== '') {
          return {
            valid: false,
            brokenAt: seq,
            reason: `Genesis entry previous_hash is not null: ${prevHash}`,
          };
        }
      } else {
        const prevRow = rows[i - 1];
        if (prevHash !== prevRow.hash) {
          return {
            valid: false,
            brokenAt: seq,
            reason: `previous_hash mismatch at seq ${seq}: expected ${prevRow.hash}, got ${prevHash}`,
          };
        }
      }

      // Recompute hash and verify
      const entry = this.mapPredictionRow(row);
      const recomputedHash = this.computeHash(entry);
      if (row.hash !== recomputedHash) {
        return {
          valid: false,
          brokenAt: seq,
          reason: `Hash mismatch at seq ${seq}: expected ${recomputedHash}, got ${row.hash}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get model governance events
   */
  async getGovernanceEvents(filters: {
    model_name?: string;
    model_version?: string;
    event_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let sql = `SELECT * FROM ai_model_governance WHERE 1=1`;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.model_name) {
      sql += ` AND model_name = $${paramIdx++}`;
      params.push(filters.model_name);
    }
    if (filters.model_version) {
      sql += ` AND model_version = $${paramIdx++}`;
      params.push(filters.model_version);
    }
    if (filters.event_type) {
      sql += ` AND event_type = $${paramIdx++}`;
      params.push(filters.event_type);
    }
    if (filters.start_date) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(filters.end_date);
    }

    sql += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${paramIdx++}`;
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += ` OFFSET $${paramIdx++}`;
      params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get feature importance for model version
   */
  async getFeatureImportance(
    modelName: string,
    modelVersion: string,
    limit?: number
  ): Promise<Array<{
    feature_name: string;
    importance_score: number;
    feature_type?: string;
    explanation_method: string;
  }>> {
    const sql = `
      SELECT feature_name, importance_score, feature_type, explanation_method
      FROM ai_feature_importance
      WHERE model_name = $1 AND model_version = $2
      ORDER BY importance_score DESC
      ${limit ? `LIMIT $3` : ''}
    `;
    const params = limit ? [modelName, modelVersion, limit] : [modelName, modelVersion];

    const result = await query(sql, params);
    return result.rows.map(row => ({
      feature_name: row.feature_name as string,
      importance_score: parseFloat(row.importance_score as string),
      feature_type: row.feature_type as string | undefined,
      explanation_method: row.explanation_method as string,
    }));
  }

  /**
   * Export predictions to CSV
   */
  exportToCsv(predictions: AIPredictionLog[]): string {
    const headers = [
      'id', 'tenant_id', 'sequence_number', 'prediction_timestamp',
      'model_name', 'model_version', 'model_type', 'confidence',
      'market_id', 'strategy', 'wallet_label', 'hash', 'previous_hash'
    ];

    const rows = predictions.map(p => [
      p.id,
      p.tenant_id,
      p.sequence_number,
      p.prediction_timestamp,
      p.model_name,
      p.model_version,
      p.model_type,
      p.confidence.toString(),
      p.market_id || '',
      p.strategy || '',
      p.wallet_label || '',
      p.hash,
      p.previous_hash || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Export predictions to JSON
   */
  exportToJson(predictions: AIPredictionLog[]): string {
    return JSON.stringify(predictions, null, 2);
  }

  /**
   * Flush buffered writes to database
   */
  async flushBuffer(): Promise<void> {
    if (this.writeBuffer.length === 0) return;

    const buffer = [...this.writeBuffer];
    this.writeBuffer = [];

    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    await this.batchInsert(buffer);
  }

  private scheduleBatchFlush(): void {
    if (this.bufferTimer) return;

    this.bufferTimer = setTimeout(() => {
      this.flushBuffer().catch(err => {
        logger.error('[AIAudit] Scheduled batch flush failed:', err);
      });
    }, this.batchTimeoutMs);
  }

  /**
   * Batch insert predictions using transaction
   */
  private async batchInsert(predictions: AIPredictionLog[]): Promise<void> {
    if (predictions.length === 0) return;

    try {
      await transaction(async (client) => {
        for (const pred of predictions) {
          await client.query(
            `INSERT INTO ai_predictions (
              id, tenant_id, sequence_number, prediction_timestamp,
              model_name, model_version, model_type, input_features,
              prediction_result, confidence, market_id, strategy, wallet_label,
              hash, previous_hash, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (tenant_id, sequence_number) DO NOTHING`,
            [
              pred.id,
              pred.tenant_id,
              pred.sequence_number,
              pred.prediction_timestamp,
              pred.model_name,
              pred.model_version,
              pred.model_type,
              JSON.stringify(pred.input_features),
              JSON.stringify(pred.prediction_result),
              pred.confidence,
              pred.market_id || null,
              pred.strategy || null,
              pred.wallet_label || null,
              pred.hash,
              pred.previous_hash,
              JSON.stringify(pred.metadata),
              pred.created_at,
            ]
          );
        }
      });

      logger.info(`[AIAudit] Batch inserted ${predictions.length} predictions`);
    } catch (err) {
      logger.error('[AIAudit] Batch insert failed, retrying one-by-one:', err);
      // Fallback: insert individually to not lose data
      for (const pred of predictions) {
        try {
          await query(
            `INSERT INTO ai_predictions (
              id, tenant_id, sequence_number, prediction_timestamp,
              model_name, model_version, model_type, input_features,
              prediction_result, confidence, market_id, strategy, wallet_label,
              hash, previous_hash, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (tenant_id, sequence_number) DO NOTHING`,
            [
              pred.id,
              pred.tenant_id,
              pred.sequence_number,
              pred.prediction_timestamp,
              pred.model_name,
              pred.model_version,
              pred.model_type,
              JSON.stringify(pred.input_features),
              JSON.stringify(pred.prediction_result),
              pred.confidence,
              pred.market_id || null,
              pred.strategy || null,
              pred.wallet_label || null,
              pred.hash,
              pred.previous_hash,
              JSON.stringify(pred.metadata),
              pred.created_at,
            ]
          );
        } catch (insertErr) {
          logger.error('[AIAudit] Failed to insert prediction:', {
            id: pred.id,
            error: insertErr,
          });
        }
      }
    }
  }

  /**
   * Get last sequence number and hash for a tenant
   */
  private async getLastSequenceAndHash(tenantId: string): Promise<{
    lastSequence: number;
    lastHash: string | null;
  }> {
    // Check cache first
    if (this.sequenceCache.has(tenantId)) {
      return {
        lastSequence: this.sequenceCache.get(tenantId)!,
        lastHash: this.hashCache.get(tenantId) || null,
      };
    }

    // Query database
    const result = await query(
      `SELECT sequence_number, hash
       FROM ai_predictions
       WHERE tenant_id = $1
       ORDER BY sequence_number DESC
       LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const seq = parseInt(row.sequence_number as string, 10);
      const hash = row.hash as string;

      this.sequenceCache.set(tenantId, seq);
      this.hashCache.set(tenantId, hash);

      return { lastSequence: seq, lastHash: hash };
    }

    return { lastSequence: 0, lastHash: null };
  }

  /**
   * Compute SHA-256 hash for a prediction entry
   * Deterministic: includes previous_hash for chaining
   */
  private computeHash(entry: {
    tenant_id: string;
    sequence_number: number;
    prediction_timestamp: string;
    model_name: string;
    model_version: string;
    model_type: string;
    input_features: Record<string, unknown>;
    prediction_result: Record<string, unknown>;
    confidence: number;
    market_id?: string;
    strategy?: string;
    wallet_label?: string;
    metadata: Record<string, unknown>;
    previous_hash: string | null;
  }): string {
    const payload = {
      tenant_id: entry.tenant_id,
      sequence_number: String(entry.sequence_number),
      prediction_timestamp: entry.prediction_timestamp,
      model_name: entry.model_name,
      model_version: entry.model_version,
      model_type: entry.model_type,
      input_features: entry.input_features,
      prediction_result: entry.prediction_result,
      confidence: entry.confidence,
      market_id: entry.market_id,
      strategy: entry.strategy,
      wallet_label: entry.wallet_label,
      metadata: entry.metadata,
      previous_hash: entry.previous_hash,
    };

    // Deterministic serialization: sort keys
    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());

    // SHA-256
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(payloadStr).digest('hex');
  }

  /**
   * Map database row to AIPredictionLog
   */
  private mapPredictionRow(row: Record<string, unknown>): AIPredictionLog {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      sequence_number: parseInt(row.sequence_number as string, 10),
      prediction_timestamp: row.prediction_timestamp as string,
      model_name: row.model_name as string,
      model_version: row.model_version as string,
      model_type: row.model_type as AIPredictionLog['model_type'],
      input_features: (row.input_features as string) ? JSON.parse(row.input_features as string) : {},
      prediction_result: (row.prediction_result as string) ? JSON.parse(row.prediction_result as string) : {},
      confidence: parseFloat(row.confidence as string),
      market_id: row.market_id as string | undefined,
      strategy: row.strategy as string | undefined,
      wallet_label: row.wallet_label as string | undefined,
      hash: row.hash as string,
      previous_hash: row.previous_hash as string | null,
      metadata: (row.metadata as string) ? JSON.parse(row.metadata as string) : {},
      created_at: row.created_at as string,
    };
  }

  /**
   * Map database row to AIExplanation
   */
  private mapExplanationRow(row: Record<string, unknown>): AIExplanation {
    return {
      id: row.id as string,
      prediction_id: row.prediction_id as string,
      explanation_type: row.explanation_type as AIExplanation['explanation_type'],
      explanation_data: (row.explanation_data as string) ? JSON.parse(row.explanation_data as string) : {},
      feature_contributions: row.feature_contributions ? JSON.parse(row.feature_contributions as string) : undefined,
      top_features: row.top_features ? JSON.parse(row.top_features as string) : undefined,
      reasoning_text: row.reasoning_text as string | undefined,
      risk_factors: row.risk_factors as string[] | undefined,
      decision_rationale: row.decision_rationale as string | undefined,
      created_at: row.created_at as string,
    };
  }
}

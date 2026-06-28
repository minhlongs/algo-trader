# Phase 2: Core Audit Service

## Context Links
- Plan: `../plan.md`
- Phase 1: Database schema created
- Existing services: `src/audit/audit-log-service.ts`, `src/audit/immutable-trade-audit.ts`
- Existing patterns: Hash chaining, batch writes, retention policies

---

## Overview

**Priority:** Critical
**Status:** Not Started
**Description:** Implement the core `AIDecisionAuditService` that provides methods to log predictions, store explanations, and query audit records. Follow the immutable logging pattern from `ImmutableTradeAudit` with hash chaining for tamper detection.

---

## Key Insights

1. **Immutable logging pattern:**
   - Use hash chaining: each entry includes hash of previous entry
   - Append-only writes, never update or delete
   - Sequence numbers per tenant for ordering
   - In-memory cache for recent entries, persisted to PostgreSQL

2. **Performance considerations:**
   - High-frequency predictions: batch writes to reduce DB load
   - Async logging: don't block prediction pipeline
   - Compress large explanation artifacts before storage
   - Use Redis cache for hot audit data

3. **Service structure:**
   - Singleton pattern like `AuditLogService`
   - Methods: `logPrediction()`, `storeExplanation()`, `queryPredictions()`, `verifyChainIntegrity()`
   - Event emission for downstream consumers (monitoring, alerts)
   - Retention management: archive old records, enforce TTL

---

## Requirements

### Functional
1. `logPrediction()`: Log AI model prediction with features, result, confidence, model metadata
2. `storeExplanation()`: Attach explanation artifact (SHAP, LIME, LLM reasoning) to a prediction
3. `queryPredictions()`: Query audit trail with filters (tenant, model, date range, market, confidence threshold)
4. `verifyChainIntegrity()`: Verify hash chain integrity for tamper detection (per tenant)
5. `batchWrite()`: Efficient batch insert for high-throughput scenarios
6. `exportToCsv/Json()`: Export audit data for compliance reviews
7. `getModelGovernanceEvents()`: Retrieve model lifecycle events for audit

### Non-Functional
1. Async operations: don't block caller
2. Error handling: fail gracefully, retry logic, dead letter queue
3. Type safety: full TypeScript interfaces for all records
4. Observability: logging, metrics (predictions/sec, write latency, error rates)
5. Backward compatible: handle schema evolution

---

## Architecture

### Service Class: `AIDecisionAuditService`

**Location:** `src/audit/ai-decision-audit-service.ts`

**Pattern:** Similar to `ImmutableTradeAudit` but with:
- PostgreSQL persistence (not file-based)
- Multi-tenant sequence chains (per-tenant hash chains)
- Batch write support
- Query interface with rich filters

**Key Methods:**

```typescript
export interface AIPredictionLog {
  // Identifiers
  id: string;
  tenant_id: string;
  sequence_number: number;
  
  // Prediction
  prediction_timestamp: string;
  model_name: string;
  model_version: string;
  model_type: 'gru' | 'llm' | 'ensemble' | 'rule_based';
  
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
  explanation_type: 'shap' | 'lime' | 'llm_reasoning' | 'feature_importance';
  explanation_data: Record<string, unknown>;
  feature_contributions?: Record<string, number>;
  top_features?: Array<{feature: string, contribution: number}>;
  reasoning_text?: string;
  risk_factors?: string[];
  created_at: string;
}

export class AIDecisionAuditService {
  private static instance: AIDecisionAuditService;
  private sequenceCache: Map<string, number> = new Map(); // tenant_id → last sequence
  private hashCache: Map<string, string> = new Map(); // tenant_id → last hash
  
  // Config
  private retentionDays: number;
  private batchSize: number;
  private batchTimeoutMs: number;
  
  // Batch write buffer
  private writeBuffer: AIPredictionLog[] = [];
  private bufferLocked: boolean = false;
  
  private constructor() {
    this.retentionDays = parseInt(config.AUDIT_RETENTION_DAYS || '2555', 10); // 7 years default
    this.batchSize = parseInt(config.AI_AUDIT_BATCH_SIZE || '100', 10);
    this.batchTimeoutMs = parseInt(config.AI_AUDIT_BATCH_TIMEOUT_MS || '5000', 10);
  }
  
  static getInstance(): AIDecisionAuditService { ... }
  
  // Log prediction with hash chaining
  async logPrediction(
    tenantId: string,
    prediction: {
      modelName: string;
      modelVersion: string;
      modelType: string;
      inputFeatures: Record<string, unknown>;
      predictionResult: Record<string, unknown>;
      confidence: number;
      marketId?: string;
      strategy?: string;
      walletLabel?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AIPredictionLog> { ... }
  
  // Store explanation linked to prediction
  async storeExplanation(
    predictionId: string,
    explanation: {
      type: AIExplanation['explanation_type'];
      data: Record<string, unknown>;
      featureContributions?: Record<string, number>;
      reasoningText?: string;
      riskFactors?: string[];
    }
  ): Promise<AIExplanation> { ... }
  
  // Query with filters
  async queryPredictions(filters: {
    tenantId?: string;
    modelName?: string;
    modelVersion?: string;
    startDate?: string;
    endDate?: string;
    marketId?: string;
    minConfidence?: number;
    limit?: number;
    offset?: number;
  }): Promise<AIPredictionLog[]> { ... }
  
  // Get prediction with explanations joined
  async getPredictionWithExplanations(predictionId: string): Promise<{
    prediction: AIPredictionLog | null;
    explanations: AIExplanation[];
  }> { ... }
  
  // Verify hash chain integrity for a tenant
  async verifyChainIntegrity(tenantId: string): Promise<{
    valid: boolean;
    brokenAt?: number;
    reason?: string;
  }> { ... }
  
  // Governance queries
  async getModelPerformanceHistory(modelName: string, modelVersion?: string): Promise<Array<{
    version: string;
    trainingDate: string;
    metrics: Record<string, number>;
    deploymentApproval: {
      approvedBy: string;
      approvedAt: string;
      justification: string;
    };
  }>> { ... }
  
  // Batch write
  async flushBuffer(): Promise<void>;
  private scheduleBatchFlush(): void;
  
  // Export
  exportToCsv(predictions: AIPredictionLog[]): string;
  exportToJson(predictions: AIPredictionLog[]): string;
  
  // Retention
  async cleanupOldRecords(): Promise<{removed: number}>;
}

```

**Helper Functions:**

```typescript
// Hash computation (same pattern as tenant-audit-log.ts)
function computePredictionHash(entry: Omit<AIPredictionLog, 'hash'>): string { ... }

// Get last sequence and hash for tenant from database
async function getLastSequenceAndHash(tenantId: string): Promise<{seq: number; hash: string | null}> { ... }
```

---

## Implementation Steps

1. **Create service file** `src/audit/ai-decision-audit-service.ts`
2. **Define TypeScript interfaces** for AIPredictionLog, AIExplanation, query filters
3. **Implement hash chaining** utility function
4. **Implement logPrediction()**:
   - Fetch last sequence & hash for tenant
   - Compute hash
   - Buffer for batch write
   - Schedule async flush
5. **Implement storeExplanation()** - direct insert (no buffering needed)
6. **Implement queryPredictions()** - PostgreSQL query with parameterized filters
7. **Implement verifyChainIntegrity()** - fetch all predictions for tenant, verify hash chain
8. **Implement batch write** with timeout and size triggers
9. **Add error handling**: retry logic, dead letter queue for failed writes
10. **Add metrics**: counter for predictions logged, write latency, errors
11. **Write unit tests**:
    - Hash computation correctness
    - Sequence numbering per tenant
    - Chain integrity verification
    - Query filters
    - Batch write behavior
12. **Integration test**: Insert 1000 predictions, verify chain

---

## Success Criteria

- [ ] Service class implemented with all required methods
- [ ] Hash chaining working correctly (verified by unit tests)
- [ ] Batch write optimization reduces DB load by ≥10x vs individual inserts
- [ ] Query latency: <100ms for filtered queries on 1M records
- [ ] Unit test coverage ≥80%
- [ ] Integration test verifies end-to-end logging and verification
- [ ] Error handling: service continues operating when DB is temporarily unavailable
- [ ] Metrics exported: predictions_logged_total, write_latency_seconds, write_errors_total

---

## Testing Strategy

**Unit Tests** (`src/audit/__tests__/ai-decision-audit-service.test.ts`):
- Hash computation deterministic
- Sequence numbers increment correctly per tenant
- Chain verification detects tampering
- Batch buffer flush at size and timeout
- Export formats valid CSV/JSON

**Integration Tests** (`tests/integration/ai-audit/`):
- Insert 100 predictions, verify all retrieved
- Verify hash chain across batch boundaries
- Query filters work correctly
- Chain integrity check passes on valid data, fails on tampered

**Performance Tests**:
- Benchmark: 10k predictions logged in <5s
- Query 1M records with filters in <2s (with indexes)

---

## Dependencies

- Phase 1: Database tables must exist
- PostgreSQL client: `src/db/postgres-client.ts`
- Config: `src/config/env`
- Logger: `src/utils/logger`

---

## Risks

**Risk:** Batch write loses data if process crashes before flush
**Mitigation:** Write-ahead logging to Redis or smaller batches (≤1s)

**Risk:** Sequence number collisions under high concurrency
**Mitigation:** Use database sequence or advisory lock (like tenant_audit_logs uses `pg_advisory_xact_lock`)

**Risk:** Hash chain verification slow on millions of records
**Mitigation:** Cache last hash per tenant, verify incrementally, limit date ranges

---

## Next Steps

After Phase 2 completion:
- Phase 3: Create REST API endpoints
- Phase 4: Integrate with AI components

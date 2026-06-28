# Phase 1: Database Schema & Migrations

## Context Links
- Plan: `../plan.md`
- Existing schema: `src/db/schema.sql`
- Existing migrations: `src/db/migrations/`
- Tenant audit pattern: `src/audit/tenant-audit-log.ts`

---

## Overview

**Priority:** Critical
**Status:** Not Started
**Description:** Design and implement PostgreSQL database schema for AI decision audit trail, including tables for predictions, explanations, feature importance, and model governance events. Follow existing migration patterns in the project.

---

## Key Insights

1. **Existing patterns to follow:**
   - Migration numbering: Use sequential numbers (025+)
   - Migration format: TypeScript or SQL (prefer TypeScript for complex logic)
   - Use `tenant_id` for multi-tenancy support (from tenant_audit_logs pattern)
   - JSONB columns for flexible metadata storage
   - Indexes on query patterns: tenant + created_at, sequence numbers

2. **Schema requirements from audit trail needs:**
   - Immutable audit records: once written, never updated
   - Chain of custody: consider hash chaining for tamper detection (like tenant_audit_logs)
   - Support high-volume predictions (potentially thousands per minute)
   - Efficient querying by model, date, tenant, outcome
   - Large artifact storage (explanations) may need separate table or external storage

3. **Compliance considerations:**
   - Retention policies (configurable, default 7 years for compliance)
   - Export capabilities (CSV, JSON)
   - PII/data privacy: may need to redact sensitive features
   - Immutability: no DELETE operations, only soft delete with is_active flag

---

## Requirements

### Functional
1. Create `ai_predictions` table to log every AI model prediction
2. Create `ai_explanations` table for SHAP/LIME/LLM reasoning artifacts
3. Create `ai_model_governance` table for model lifecycle events
4. Create `ai_feature_importance` table for global feature importance metrics
5. Support multi-tenant isolation via `tenant_id`
6. Enable efficient query patterns with appropriate indexes

### Non-Functional
1. Migration must be zero-downtime compatible
2. Schema must handle high write volume (partitioning consideration)
3. Export queries must be performant on large datasets (years of data)
4. Follow existing PostgreSQL conventions (TIMESTAMPTZ, JSONB, UUIDs)

---

## Architecture

### Database Schema

#### Table 1: `ai_predictions`
**Purpose:** Immutable log of every AI model prediction

```sql
CREATE TABLE IF NOT EXISTS ai_predictions (
  -- Primary key and identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  
  -- Prediction metadata
  prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_name VARCHAR(255) NOT NULL,  -- e.g., 'gru_price_predictor', 'signal_validator'
  model_version VARCHAR(100) NOT NULL,  -- semantic version or git SHA
  model_type VARCHAR(100) NOT NULL,  -- 'gru', 'llm', 'ensemble', 'rule_based'
  
  -- Input features (serialized)
  input_features JSONB NOT NULL DEFAULT '{}',  -- Raw features used for prediction
  
  -- Prediction output
  prediction_result JSONB NOT NULL DEFAULT '{}',  -- Model output (price, direction, confidence, etc.)
  confidence DECIMAL(5,4) NOT NULL,  -- 0.0000-1.0000
  
  -- Context
  market_id TEXT,  -- Polymarket market ID if applicable
  strategy VARCHAR(100),  -- Strategy that invoked this prediction
  wallet_label TEXT,  -- Wallet used if prediction led to trade
  
  -- Hash chain for immutability (like tenant_audit_logs)
  hash VARCHAR(64) NOT NULL,
  previous_hash VARCHAR(64),
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',  -- Additional context (tenant tier, IP, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT uq_ai_predictions_tenant_sequence UNIQUE (tenant_id, sequence_number)
);

-- Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_ai_predictions_tenant_created 
  ON ai_predictions (tenant_id, prediction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_model 
  ON ai_predictions (model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_market 
  ON ai_predictions (market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_predictions_hash 
  ON ai_predictions (hash);
```

#### Table 2: `ai_explanations`
**Purpose:** Store explanation artifacts (SHAP, LIME, LLM reasoning)

```sql
CREATE TABLE IF NOT EXISTS ai_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES ai_predictions(id) ON DELETE CASCADE,
  
  -- Explanation type
  explanation_type VARCHAR(50) NOT NULL,  -- 'shap', 'lime', 'llm_reasoning', 'feature_importance'
  
  -- Explanation data
  explanation_data JSONB NOT NULL DEFAULT '{}',  -- Full artifact data
  feature_contributions JSONB,  -- For SHAP/LIME: {feature_name: contribution}
  top_features JSONB,  -- Array of top N most important features
  
  -- Text explanations (for LLM outputs)
  reasoning_text TEXT,
  risk_factors TEXT[],  -- Array of identified risks
  
  -- Metadata
  explanation_metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_ai_explanations_prediction UNIQUE (prediction_id, explanation_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_explanations_prediction 
  ON ai_explanations (prediction_id);
CREATE INDEX IF NOT EXISTS idx_ai_explanations_type 
  ON ai_explanations (explanation_type);
```

#### Table 3: `ai_model_governance`
**Purpose:** Track model lifecycle events: training, deployment, retraining, approval

```sql
CREATE TABLE IF NOT EXISTS ai_model_governance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,  -- NULL for global models
  
  -- Model identification
  model_name VARCHAR(255) NOT NULL,
  model_version VARCHAR(100) NOT NULL,
  
  -- Governance event type
  event_type VARCHAR(50) NOT NULL,  -- 'training_requested', 'training_started', 'training_completed', 
                                    -- 'deployment_approved', 'deployed', 'retirement_requested',
                                    -- 'retraining_justified', 'performance_degraded'
  
  -- Event details
  event_data JSONB NOT NULL DEFAULT '{}',  -- Event-specific data
  
  -- Training details (for training events)
  training_dataset_hash VARCHAR(64),  -- Hash of training dataset
  training_metrics JSONB,  -- {accuracy, precision, recall, f1, mse, etc.}
  baseline_metrics JSONB,  -- Previous model metrics for comparison
  
  -- Approval workflow
  requested_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  approval_justification TEXT,
  approval_timestamp TIMESTAMPTZ,
  
  -- Performance justification (for retraining)
  performance_regression DECIMAL(10,4),  -- Metric drop percentage
  drift_detected BOOLEAN DEFAULT FALSE,
  drift_metrics JSONB,  -- Data drift, concept drift metrics
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT chk_ai_governance_event CHECK (
    event_type IN (
      'training_requested', 'training_started', 'training_completed',
      'deployment_approved', 'deployed', 'retirement_requested',
      'retraining_justified', 'performance_degraded'
    )
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_governance_model 
  ON ai_model_governance (model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_ai_governance_tenant 
  ON ai_model_governance (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_governance_event 
  ON ai_model_governance (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_governance_approval 
  ON ai_model_governance (approved_by, approval_timestamp) 
  WHERE approved_by IS NOT NULL;
```

#### Table 4: `ai_feature_importance`
**Purpose:** Global feature importance per model version (SHAP values, permutation importance)

```sql
CREATE TABLE IF NOT EXISTS ai_feature_importance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name VARCHAR(255) NOT NULL,
  model_version VARCHAR(100) NOT NULL,
  
  -- Feature and importance
  feature_name VARCHAR(255) NOT NULL,
  importance_score DECIMAL(10,6) NOT NULL,  -- Normalized 0-1
  
  -- Feature metadata
  feature_type VARCHAR(50),  -- 'numerical', 'categorical', 'binary'
  feature_description TEXT,
  
  -- Explanation method
  explanation_method VARCHAR(50) NOT NULL,  -- 'shap', 'lime', 'permutation', 'integrated_gradients'
  
  -- Metadata
  calculation_metadata JSONB NOT NULL DEFAULT '{}',  -- How importance was computed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_ai_feature_importance_model_feature 
    UNIQUE (model_name, model_version, feature_name, explanation_method)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_feature_importance_model 
  ON ai_feature_importance (model_name, model_version, importance_score DESC);
```

### Migration File

**Path:** `src/db/migrations/025-create-ai-audit-tables.ts`

Follow existing migration pattern (see `020_db_performance_optimizations.ts`):

```typescript
import { query } from '../postgres-client';

export async function up(): Promise<void> {
  // Read SQL file or inline SQL
  const sql = `...`; // All table creation statements
  
  await query(sql);
}

export async function down(): Promise<void> {
  // Drop tables in reverse order (due to FK dependencies)
  await query(`
    DROP TABLE IF EXISTS ai_feature_importance CASCADE;
    DROP TABLE IF EXISTS ai_model_governance CASCADE;
    DROP TABLE IF EXISTS ai_explanations CASCADE;
    DROP TABLE IF EXISTS ai_predictions CASCADE;
  `);
}
```

---

## Implementation Steps

1. **Design schema** - Finalize table structures with all required fields
2. **Create migration file** - Implement `025-create-ai-audit-tables.ts`
3. **Add hash chaining function** - Utility for computing prediction hash chains (similar to `computeTenantAuditHash`)
4. **Review migration** - Ensure backward compatibility, zero-downtime
5. **Test migration** - Run on staging database
6. **Document schema** - Update `docs/system-architecture.md` with new tables
7. **Create rollback plan** - Test `down()` migration

---

## Success Criteria

- [ ] Migration file created and passes type checking
- [ ] Migration runs successfully on empty database
- [ ] Migration runs successfully on existing production-like database (zero-downtime)
- [ ] Rollback migration (`down()`) works correctly
- [ ] All tables created with proper constraints and indexes
- [ ] Schema diagram documented in system architecture docs
- [ ] Query performance tested: can retrieve 1M prediction records in <2s with filters

---

## Risk Assessment

**High:** Migration on large production database
- **Mitigation:** Test on staging with realistic data volume, use batch migration if needed

**Medium:** Schema changes may require updates to existing AI components
- **Mitigation:** Make schema backward compatible, use NULL defaults, phase integration

**Low:** Query performance on time-series data
- **Mitigation:** Proper indexes, consider partitioning by month after 1 year of data

---

## Next Steps After Phase 1

- Phase 2: Implement `AIDecisionAuditService` with hash chaining and batch writes
- Phase 3: Create REST API endpoints for querying and exporting audit data
- Phase 4: Integrate with GRU model, SignalValidator, SignalFusionEngine
- Phase 5: Governance workflow UI and approval processes

---

## Questions

1. Should we partition `ai_predictions` by `tenant_id` and `prediction_timestamp` for scale?
2. Do we need TTL policies for old predictions? Retention: 7 years (compliance) or configurable?
3. Should explanation artifacts be stored in object storage (S3) instead of JSONB for large SHAP values?
4. How to handle PII in features? Need automatic redaction or feature filtering?
5. Chain of custody: Use same hash-chaining pattern as `tenant_audit_logs` or different approach?

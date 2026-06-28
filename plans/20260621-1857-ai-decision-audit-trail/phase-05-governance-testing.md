# Phase 5: Governance Workflow & Testing

## Context Links
- Plan: `../plan.md`
- Phase 2: Core service complete
- Phase 3: API routes complete
- Phase 4: AI integrations complete

---

## Overview

**Priority:** Critical
**Status:** Not Started
**Description:** Implement model governance workflow for retraining approvals, performance monitoring, and compliance reporting. Add comprehensive test coverage for entire audit trail system. Document operational procedures and runbooks.

---

## Key Insights

1. **Model governance lifecycle:**
   - Training request → approval → training → validation → deployment → monitoring
   - Retraining triggers: performance degradation, data drift, schedule
   - Approval chain: data scientist → ML engineer → compliance officer
   - Documentation: training dataset provenance, metrics, justification

2. **Existing patterns:**
   - `src/audit/audit-log-service.ts` has retention and export
   - `src/audit/immutable-trade-audit.ts` has chain verification
   - Reuse these patterns for AI audit governance

3. **Compliance requirements:**
   - Model cards: document model purpose, limitations, metrics
   - Audit trail for model decisions (explainability)
   - Performance regression detection
   - Approval workflow with electronic signatures
   - Retention: 7 years for compliance (SEC, FINRA)

---

## Requirements

### Governance Workflow

1. **Training request submission**:
   - Submit: model name, proposed version, training dataset details, expected improvement
   - Required fields: business justification, expected performance metrics, data sources
   - Auto-generated: request ID, timestamp, requester

2. **Approval workflow**:
   - Multi-stage approval: data science lead → ML engineering → compliance (if high-risk)
   - Each approver can: approve, reject with reason, request changes
   - Approval chain recorded in `ai_model_governance` with timestamps and signatures

3. **Training execution logging**:
   - Log training start/completion with dataset hash, training metrics
   - Store model artifact location (S3 path, model registry)
   - Record baseline vs new model performance comparison

4. **Deployment approval**:
   - Post-training validation results
   - Canary deployment results (if applicable)
   - Final deployment approval with production rollout

5. **Performance monitoring**:
   - Automated drift detection (data drift, concept drift)
   - Performance degradation alerts (accuracy drop > threshold)
   - Auto-create governance event when thresholds breached

6. **Retirement/rollback**:
   - Model retirement request with reason
   - Rollback to previous version with incident report

### Testing

1. **Unit tests**:
   - All service methods
   - Hash chaining correctness
   - Query filter logic
   - Governance state transitions

2. **Integration tests**:
   - End-to-end prediction logging
   - Chain integrity verification
   - Governance workflow: request → approve → train → deploy
   - API endpoints with real DB

3. **Performance tests**:
   - High-volume prediction logging (10k/sec)
   - Query performance on large datasets (1M+ records)
   - Concurrent access (100 simultaneous queries)

4. **Security tests**:
   - Tenant isolation enforced
   - Unauthorized access prevented
   - SQL injection resistant
   - PII redaction if applicable

### Documentation

1. **System architecture doc** (`docs/system-architecture.md`):
   - AI audit trail component diagram
   - Database schema documentation
   - Integration points with AI components

2. **API documentation**:
   - OpenAPI/Swagger spec for new endpoints
   - Example requests/responses
   - Authentication requirements

3. **Operational runbooks**:
   - How to query audit trail for investigation
   - How to verify chain integrity
   - How to handle audit service failures
   - Retention and archiving procedures
   - Disaster recovery: rebuild hash chains

4. **Compliance guides**:
   - How to generate audit reports for SOC2/ISO27001
   - Model governance SOP (Standard Operating Procedure)
   - Retraining justification template

---

## Architecture

### Governance Workflow Service

**File:** `src/audit/model-governance-workflow.ts`

```typescript
export enum GovernanceEventType {
  TRAINING_REQUESTED = 'training_requested',
  TRAINING_APPROVED = 'training_approved',
  TRAINING_REJECTED = 'training_rejected',
  TRAINING_STARTED = 'training_started',
  TRAINING_COMPLETED = 'training_completed',
  DEPLOYMENT_APPROVED = 'deployment_approved',
  DEPLOYED = 'deployed',
  PERFORMANCE_DEGRADED = 'performance_degraded',
  RETRAINING_JUSTIFIED = 'retraining_justified',
  RETIRED = 'retired'
}

export interface TrainingRequest {
  requestId: string;
  modelName: string;
  proposedVersion: string;
  requestedBy: string;
  requestedAt: Date;
  businessJustification: string;
  trainingDataset: {
    hash: string;
    source: string;
    size: number;
    timeRange: { start: string; end: string };
  };
  expectedMetrics: Record<string, number>; // {accuracy: 0.95, f1: 0.93}
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  approvals: Array<{
    approver: string;
    role: string;
    decision: 'approve' | 'reject';
    reason?: string;
    timestamp: Date;
  }>;
}

export class ModelGovernanceWorkflow {
  private auditService: AIDecisionAuditService;
  
  constructor(auditService: AIDecisionAuditService) {
    this.auditService = auditService;
  }
  
  // Submit training request
  async submitTrainingRequest(request: {
    modelName: string;
    proposedVersion: string;
    businessJustification: string;
    trainingDataset: { hash: string; source: string; size: number; timeRange: {start: string; end: string} };
    expectedMetrics: Record<string, number>;
  }, requester: string): Promise<TrainingRequest> { ... }
  
  // Approve/reject request
  async approveTrainingRequest(
    requestId: string,
    approver: string,
    role: string,
    decision: 'approve' | 'reject',
    reason?: string
  ): Promise<void> { ... }
  
  // Log training start/completion
  async logTrainingEvent(
    modelName: string,
    version: string,
    event: GovernanceEventType,
    data: {
      trainingMetrics?: Record<string, number>;
      baselineMetrics?: Record<string, number>;
      modelArtifactPath?: string;
      durationMs?: number;
    }
  ): Promise<void> { ... }
  
  // Deploy model (requires prior approvals)
  async deployModel(
    modelName: string,
    version: string,
    deployedBy: string,
    deploymentMetadata?: Record<string, unknown>
  ): Promise<void> { ... }
  
  // Report performance degradation
  async reportPerformanceDegradation(
    modelName: string,
    version: string,
    currentMetrics: Record<string, number>,
    baselineMetrics: Record<string, number>,
    driftMetrics?: Record<string, number>
  ): Promise<void> { ... }
  
  // Query governance history for model
  async getModelHistory(modelName: string, version?: string): Promise<Array<{
    eventType: GovernanceEventType;
    timestamp: Date;
    actor: string;
    details: Record<string, unknown>;
  }>> { ... }
}
```

### Retraining Justification Automation

Detect performance degradation automatically and generate justification:

```typescript
export class PerformanceMonitor {
  private auditService: AIDecisionAuditService;
  private governance: ModelGovernanceWorkflow;
  
  constructor(auditService: AIDecisionAuditService, governance: ModelGovernanceWorkflow) {}
  
  // Called periodically (e.g., daily)
  async checkModelPerformance(): Promise<void> {
    const models = await this.getActiveModels();
    
    for (const model of models) {
      const currentMetrics = await this.calculateRecentMetrics(model);
      const baselineMetrics = await this.getBaselineMetrics(model);
      
      // Check if performance dropped beyond threshold
      const degradation = this.calculateDegradation(baselineMetrics, currentMetrics);
      
      if (degradation.accuracyDrop > 0.05) { // 5% threshold
        await this.governance.reportPerformanceDegraded(
          model.name,
          model.version,
          currentMetrics,
          baselineMetrics,
          { accuracyDrop: degradation.accuracyDrop, detectedAt: new Date() }
        );
        
        // Also create retraining justification
        await this.createRetrainingJustification(model, degradation);
      }
    }
  }
}
```

---

## Implementation Steps

### 1. Governance Workflow Service
- Create `src/audit/model-governance-workflow.ts`
- Implement all methods: submit request, approve, log training, deploy, report degradation
- Use `AIDecisionAuditService` to write governance events to `ai_model_governance` table
- Add state validation (can't deploy without approval)

### 2. Performance Monitor
- Create `src/audit/performance-monitor.ts`
- Query recent predictions from `ai_predictions` (linked with outcomes from `prediction-accuracy-tracker`)
- Calculate metrics: accuracy, precision, recall, confidence calibration
- Compare against baseline (deployed model metrics)
- Trigger degradation events when thresholds breached

### 3. Comprehensive Testing

**Unit Tests**:
- Governance workflow state transitions
- Approval logic (min approvals required, role checks)
- Performance metric calculations
- Degradation detection thresholds

**Integration Tests**:
- Full governance lifecycle: request → approve → train → deploy
- Chain of custody: verify all steps recorded immutably
- Query governance history via API
- Performance monitor detects real degradation

**End-to-End Tests**:
- Deploy test model, simulate drift, verify auto-ticket created
- Query API returns complete audit trail with all explanations
- Export compliance report (CSV) with all required fields

### 4. Documentation Updates

- Update `docs/system-architecture.md` with AI audit trail diagrams
- Create `docs/ai-audit-runbook.md` for operations team
- Create `docs/model-governance-sop.md` for compliance
- Add API examples to `docs/api-reference.md` or generate from OpenAPI

### 5. Security & Compliance Hardening

- Add PII redaction: scrub sensitive features from exported data
- Add field-level encryption for highly sensitive metadata (optional)
- Implement audit log access reviews (quarterly)
- Add data retention automation: archive >1 year to S3, delete >7 years

---

## Success Criteria

- [ ] Governance workflow implemented: request → approve → train → deploy
- [ ] All governance events logged to `ai_model_governance` with approver signatures
- [ ] Performance monitor detects degradation with configurable thresholds
- [ ] Auto-generated retraining justifications include evidence
- [ ] Unit test coverage ≥80% for all new code
- [ ] Integration tests cover all workflows end-to-end
- [ ] API tests all passing with authentication/authorization
- [ ] Performance tests meet SLAs: 10k predictions/sec logging, <200ms query latency
- [ ] Documentation complete: architecture, API, runbooks, SOPs
- [ ] Security review passed: tenant isolation, SQL injection, PII protection
- [ ] Compliance report generation validated (sample SOC2 evidence package)

---

## Testing Strategy

**Unit Tests** (`src/audit/__tests__/`):
- `model-governance-workflow.test.ts`: State transitions, approvals
- `performance-monitor.test.ts`: Metric calculations, threshold detection
- `ai-decision-audit-service.test.ts`: All service methods

**Integration Tests** (`tests/integration/ai-audit/`):
- `governance-workflow.test.ts`: Full lifecycle
- `audit-trail-completeness.test.ts`: All AI components integrated
- `chain-of-custody.test.ts`: Hash chain verification end-to-end
- `api-endpoints.test.ts`: All API routes with authz

**Performance Tests** (`tests/performance/`):
- `ai-audit-throughput.test.ts`: 10k predictions/sec
- `query-latency.test.ts`: P95 <200ms for filtered queries
- `concurrent-access.test.ts`: 100 simultaneous users

**Security Tests** (`tests/security/`):
- `tenant-isolation.test.ts`: Cross-tenant access denied
- `pii-redaction.test.ts`: Sensitive features redacted in exports
- `sql-injection.test.ts`: Parameterized queries only

---

## Dependencies

- Phase 2: `AIDecisionAuditService` complete
- Phase 3: API routes complete
- Phase 4: AI components integrated
- Existing: PredictionAccuracyTracker for outcome data

---

## Risks

**Risk:** Governance workflow becomes bottleneck
**Mitigation:** Automated approvals for low-risk models (pre-approved), SLA for manual approvals (24h)

**Risk:** False positive degradation alerts
**Mitigation:** Configurable thresholds, multiple metric confirmation, alert suppression during known regime changes

**Risk:** Compliance requirements change
**Mitigation:** Extensible schema, versioned audit records, flexible metadata storage

**Risk:** Hash chain verification slow on large datasets
**Mitigation:** Incremental verification, caching, sampling for spot checks

---

## Rollout Plan

1. **Week 1-2**: Implement governance service and performance monitor
2. **Week 3**: Integrate with AI components (Phase 4)
3. **Week 4**: Comprehensive testing (unit, integration, performance)
4. **Week 5**: Documentation and runbooks
5. **Week 6**: Security review and compliance validation
6. **Week 7**: Staging deployment with feature flag off
7. **Week 8**: Enable in production (canary: 10% traffic, then 100%)

---

## Unresolved Questions

1. Should governance approvals be mandatory for all models or just production?
2. What are exact compliance retention requirements (7 years? per jurisdiction?)
3. How to handle multi-model ensembles in governance (each model tracked separately?)
4. Should we store full model artifacts (pb files) in audit trail or just metadata?
5. How to handle model explainability for black-box models (SHAP/LIME compute cost vs value)?

---

## Next Steps After Completion

- Deploy to production with monitoring
- Train compliance team on using audit trail
- Establish quarterly model review process
- Implement advanced explainability (SHAP for GRU)
- Add automated bias detection (fairness metrics)

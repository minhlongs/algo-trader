# Phase 4: Integration with AI Components

## Context Links
- Plan: `../plan.md`
- Phase 2: Core service complete
- Phase 3: API routes complete
- Target components:
  - `src/ml/gru/gru-model.ts` - GRU price predictor
  - `src/intelligence/signal-validator.ts` - LLM signal validation
  - `src/intelligence/signal-fusion-engine.ts` - Signal fusion
  - `src/intelligence/prediction-accuracy-tracker.ts` - Accuracy tracking

---

## Overview

**Priority:** High
**Status:** Not Started
**Description:** Instrument all AI/ML components to log predictions and explanations to the audit trail. Wrap existing prediction methods to automatically capture features, results, and metadata without breaking existing functionality.

---

## Key Insights

1. **Integration patterns:**
   - Non-invasive: Wrap existing methods with audit logging
   - Decorator pattern: Use higher-order functions to add audit behavior
   - Feature capture: Log input features that influenced prediction
   - Performance impact: Async logging to minimize latency

2. **Component-specific needs:**

   **GRU Model** (`gru-model.ts`):
   - Input: OHLCV data as tensor
   - Output: predictedPrice, confidence, trend
   - Features to capture: last N candles (open, high, low, close, volume)
   - Explanations: Not built-in; need SHAP/LIME integration (future enhancement)

   **SignalValidator** (`signal-validator.ts`):
   - Input: signal candidates with reasoning
   - Output: valid, confidence, reasoning, risks, swarm votes
   - Features: signal properties (expectedEdge, markets, signalType)
   - Explanations: LLM reasoning text, risk factors, swarm consensus

   **SignalFusionEngine** (`signal-fusion-engine.ts`):
   - Input: array of signals with scores and weights
   - Output: direction, confidence, weightedScore, reasoning
   - Features: individual signal scores, weights, signal names
   - Explanations: how final score computed, which signals dominated

   **PredictionAccuracyTracker** (`prediction-accuracy-tracker.ts`):
   - Already tracks predictions and outcomes
   - Need to link to AI audit predictions (store audit ID in prediction record)
   - Integrate accuracy metrics into governance events

3. **Feature extraction:**
   - GRU: Extract last 60 candles as normalized feature array
   - SignalValidator: Flatten signal candidate into feature dict
   - FusionEngine: Signal scores, total weight, signal diversity
   - Add `tenant_id` from context where available

---

## Requirements

### Functional
1. **GRU integration**: Wrap `predict()` to log prediction to audit trail
   - Capture input tensor (last N candles)
   - Capture output: predictedPrice, confidence, trend
   - Add market context if available (market_id from caller)

2. **SignalValidator integration**: Wrap validation calls
   - Log all signals sent to LLM
   - Store LLM reasoning as explanation artifact
   - Capture swarm votes if consensus mode

3. **SignalFusion integration**: Wrap `fuseSignals()`
   - Log all input signals
   - Store weighted score calculation as explanation
   - Capture final direction and confidence

4. **PredictionAccuracyTracker integration**:
   - When recording prediction, also log to AI audit service
   - Link via `audit_prediction_id` field
   - Update governance with accuracy metrics when resolved

5. **Error handling**: If audit service fails, prediction still proceeds (best effort)

6. **Configuration**: Feature flags to enable/disable audit logging per component

---

## Architecture

### Integration Pattern: Decorator Wrapper

Create wrapper functions that call original logic then log to audit:

```typescript
// src/intelligence/audited-gru-predictor.ts
import { GruModel } from './gru-model';
import { AIDecisionAuditService } from '../audit/ai-decision-audit-service';

export function createAuditedGruPredictor(
  model: GruModel,
  auditService: AIDecisionAuditService,
  options: { enabled: boolean; tenantId?: string }
) {
  return async function auditedPredict(
    inputTensor: tf.Tensor3D,
    context?: { marketId?: string; strategy?: string; walletLabel?: string }
  ): Promise<PredictionResult> {
    // 1. Extract features from tensor for audit
    const features = extractFeaturesFromTensor(inputTensor);
    
    // 2. Call original prediction
    const result = await model.predict(inputTensor);
    
    // 3. Log to audit (async, fire-and-forget)
    if (options.enabled && options.tenantId) {
      auditService.logPrediction(options.tenantId, {
        modelName: 'gru_price_predictor',
        modelVersion: '1.0.0', // TODO: get from model metadata
        modelType: 'gru',
        inputFeatures: features,
        predictionResult: result,
        confidence: result.confidence,
        marketId: context?.marketId,
        strategy: context?.strategy,
        walletLabel: context?.walletLabel,
        metadata: { inputShape: inputTensor.shape },
      }).catch(err => logger.error('[AI Audit] Failed to log GRU prediction:', err));
    }
    
    return result;
  };
}

function extractFeaturesFromTensor(tensor: tf.Tensor3D): Record<string, number[]> {
  // Convert tensor to array and create feature dict
  const data = tensor.dataSync();
  const [samples, timesteps, features] = tensor.shape;
  // Return structured features (last timestep only for simplicity)
  return {
    timesteps,
    featureCount: features,
    lastCandle: Array.from(data.slice((samples * timesteps - features) * features, samples * timesteps)),
  };
}
```

### Integration with Each Component

#### 1. GRU Model (`src/ml/gru/gru-model.ts`)

**Changes:**
- Add optional `auditService` and `auditContext` to constructor
- Modify `predict()` to call audit logging after prediction
- **OR** create separate `AuditedGruModel` wrapper class (preferred for separation of concerns)

**Implementation:**
```typescript
// New file: src/ml/audited-gru-predictor.ts
export class AuditedGruPredictor {
  constructor(
    private model: GruModel,
    private auditService: AIDecisionAuditService,
    private tenantId: string
  ) {}
  
  async predictWithAudit(
    X: tf.Tensor3D,
    context: { marketId?: string; strategy?: string }
  ): Promise<PredictionResult> {
    // Extract features, call predict, log audit
    // (as shown above)
  }
}

// Usage in trading pipeline:
// const auditedPredictor = new AuditedGruPredictor(gruModel, auditService, tenantId);
// const result = await auditedPredictor.predictWithAudit(inputTensor, {marketId, strategy});
```

#### 2. SignalValidator (`src/intelligence/signal-validator.ts`)

**Changes:**
- Wrap `validateSignal()` method
- Capture LLM prompt and response as explanation
- Store swarm votes if applicable

```typescript
// Modify validateSignal method
async validateSignal(signal: SignalCandidate): Promise<UnifiedValidationResult> {
  // ... existing validation logic ...
  
  // After getting result:
  if (this.auditService && this.tenantId) {
    await this.auditService.logPrediction(this.tenantId, {
      modelName: 'signal_validator',
      modelVersion: '2.0.0',
      modelType: 'llm',
      inputFeatures: { signal },
      predictionResult: { valid: result.valid, confidence: result.confidence },
      confidence: result.confidence,
      strategy: signal.signalType,
      metadata: { llmModel: this.llmModel, promptTokens: promptTokens, responseTokens: responseTokens }
    });
    
    // Store explanation with LLM reasoning and votes
    await this.auditService.storeExplanation(predictionId, {
      type: 'llm_reasoning',
      data: { rawResponse: llmResponse },
      reasoningText: result.reasoning,
      riskFactors: result.risks,
    });
  }
  
  return result;
}
```

#### 3. SignalFusionEngine (`src/intelligence/signal-fusion-engine.ts`)

**Changes:**
- Wrap `fuseSignals()` to log input signals and output
- Store calculation details as explanation (weighted average breakdown)

```typescript
export async function fuseSignalsWithAudit(
  signals: SignalInput[],
  auditService: AIDecisionAuditService,
  tenantId: string,
  context?: { strategy?: string }
): Promise<FusionResult> {
  const result = fuseSignals(signals); // pure function, no change needed
  
  if (auditService && tenantId) {
    const predictionId = await auditService.logPrediction(tenantId, {
      modelName: 'signal_fusion_engine',
      modelVersion: '1.0.0',
      modelType: 'rule_based',
      inputFeatures: { signals: signals.map(s => ({name: s.name, score: s.score, weight: s.weight})) },
      predictionResult: { direction: result.direction, confidence: result.confidence, weightedScore: result.weightedScore },
      confidence: result.confidence,
      strategy: context?.strategy,
      metadata: { signalCount: signals.length }
    });
    
    // Store explanation: breakdown of weighted calculation
    await auditService.storeExplanation(predictionId, {
      type: 'feature_importance',
      data: {
        calculation: 'weighted_average',
        totalWeight: signals.reduce((sum, s) => sum + s.weight, 0),
        weightedSum: signals.reduce((sum, s) => sum + s.score * s.weight, 0),
        signalContributions: signals.map(s => ({
          name: s.name,
          contribution: s.score * s.weight,
          weightPct: s.weight / signals.reduce((sum, sig) => sum + sig.weight, 0)
        }))
      },
      featureContributions: signals.reduce((obj, s) => ({...obj, [s.name]: s.weight}), {})
    });
  }
  
  return result;
}
```

#### 4. PredictionAccuracyTracker Integration

**Changes:**
- In `recordPrediction()`, also log to AI audit service
- Store audit prediction ID for later linking
- On resolution, update governance with accuracy metrics

```typescript
// Modified recordPrediction
export function recordPrediction(
  prediction: Omit<Prediction, 'id' | 'actualOutcome' | 'resolvedAt' | 'correct'>,
  auditService?: AIDecisionAuditService,
  tenantId?: string
): string {
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // ... existing record logic ...
  
  // Also log to AI audit if service provided
  if (auditService && tenantId) {
    auditService.logPrediction(tenantId, {
      modelName: prediction.strategy, // strategy as model name
      modelVersion: '1.0.0',
      modelType: 'ensemble', // prediction tracker aggregates multiple strategies
      inputFeatures: { marketId: prediction.marketId, title: prediction.title, confidence: prediction.confidence },
      predictionResult: { predictedOutcome: prediction.predictedOutcome },
      confidence: prediction.confidence,
      marketId: prediction.marketId,
      strategy: prediction.strategy,
      metadata: { source: 'prediction_accuracy_tracker' }
    }).catch(err => logger.warn('[AI Audit] Failed to log prediction:', err));
  }
  
  return id;
}
```

---

## Implementation Steps

1. **Create wrapper modules**:
   - `src/ml/audited-gru-predictor.ts`
   - `src/intelligence/audited-signal-validator.ts`
   - `src/intelligence/audited-signal-fusion.ts`

2. **Modify existing components** (minimal changes):
   - Add optional `auditService` dependency injection
   - Add audit logging after predictions
   - Make audit logging best-effort (try/catch)

3. **Feature flags**: Use env vars to toggle audit logging per component
   - `ENABLE_GRU_AUDIT=true`
   - `ENABLE_SIGNAL_VALIDATOR_AUDIT=true`
   - Default: false in dev, true in staging/prod

4. **Tenant context propagation**:
   - Pass `tenantId` through call chain from trading pipeline
   - Default to `system` or `global` for background jobs

5. **Testing each integration**:
   - Unit test: Verify audit service called with correct params
   - Integration test: End-to-end prediction logged to database
   - Performance test: Measure prediction latency impact (<5ms overhead)

6. **Update callers**:
   - Trading pipeline: Use audited predictors
   - Signal generation: Use audited validator
   - Fusion logic: Use audited fusion function

---

## Success Criteria

- [ ] GRU predictions logged with input features and output
- [ ] SignalValidator LLM calls logged with reasoning text stored
- [ ] SignalFusion results logged with signal contributions
- [ ] PredictionAccuracyTracker entries linked to AI audit
- [ ] All logging is async and non-blocking
- [ ] Errors in audit logging don't break prediction flow
- [ ] Feature flags allow enabling/disabling per component
- [ ] Tenant context correctly propagated and logged
- [ ] Integration tests verify end-to-end audit trail
- [ ] Performance overhead <5ms per prediction (p50)

---

## Testing

**Unit Tests** (per component):
- Mock audit service, verify called with correct parameters
- Test error handling: audit service throws, prediction still succeeds
- Test feature extraction correctness

**Integration Tests**:
- Full pipeline: GRU prediction → logged → queryable via API
- SignalValidator: LLM call → prediction + explanation stored
- End-to-end: Query API returns complete audit trail with explanations

**Performance Tests**:
- Benchmark prediction latency with and without audit logging
- Load test: 1000 predictions/sec, audit logging doesn't become bottleneck

---

## Dependencies

- Phase 2: `AIDecisionAuditService` complete
- Phase 3: API routes complete (for verification)
- Existing AI components stable and well-tested

---

## Risks

**Risk:** Breaking existing AI component behavior
**Mitigation:** Use wrapper pattern, not direct modification; comprehensive tests

**Risk:** Performance degradation from synchronous audit logging
**Mitigation:** All logging async, fire-and-forget with error catch; batch writes

**Risk:** Missing tenant context in background jobs
**Mitigation:** Default tenantId to `system` or extract from configuration

**Risk:** Large input features (tensor data) bloating audit logs
**Mitigation:** Store summary statistics (shape, min/max) instead of full tensor; configurable feature capture depth

---

## Next Steps

After Phase 4:
- Phase 5: Model governance workflow and comprehensive testing
- Document integration patterns for future AI components

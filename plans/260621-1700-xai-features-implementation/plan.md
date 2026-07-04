# XAI Features Implementation Plan

## Overview
Complete implementation of Explainable AI features for algo-trader, providing transparency into trading decisions through SHAP/LIME explanations, feature importance visualization, trade rationales, counterfactual scenarios, and strategy rule extraction.

## Phases

### Phase 1: Enhance XAI Core Service
**Status:** Not Started  
**Priority:** High  
**Files to Modify:**
- `intelligence/xai_service.py` (enhance LIME, improve SHAP, add visualization data)
- `intelligence/requirements-xai.txt` (ensure all dependencies)

**Tasks:**
1. Complete LIME integration (currently stubbed)
2. Add visualization data generation (plotly JSON, bar charts, force plots)
3. Improve feature importance with permutation importance fallback
4. Add model-specific explainers for RL (PPO), Kronos (transformer), strategies
5. Add caching layer for expensive computations
6. Implement persistent storage for explanations (SQLite/PostgreSQL)

### Phase 2: Integrate XAI into Intelligence Server
**Status:** Not Started  
**Priority:** High  
**Files to Modify:**
- `intelligence/server.py` (register XAI service in lifespan)
- `intelligence/xai_endpoints.py` (NEW - FastAPI router for XAI)

**Tasks:**
1. Create XAI FastAPI router with endpoints:
   - `POST /xai/explain` - Explain prediction
   - `GET /xai/explanation/{explanation_id}` - Retrieve stored explanation
   - `GET /xai/feature-importance/{model_type}` - Aggregated importance
   - `POST /xai/counterfactual` - Generate counterfactuals
   - `POST /xai/strategy-rules` - Extract rules from code
   - `GET /xai/visualization/{type}` - Generate charts (SHAP, feature importance)
2. Inject XAI service into server lifespan
3. Add error handling and validation
4. Implement rate limiting for expensive operations

### Phase 3: Add XAI API Routes to Main Server (Optional)
**Status:** Not Started  
**Priority:** Medium  
**Files to Modify:**
- `src/api/routes/xai-routes.ts` (update or replace)
- `src/api/server.ts` (register routes)

**Tasks:**
1. Decide architecture: proxy through intelligence server or direct integration
2. If proxy: add routes that forward to intelligence sidecar
3. If direct: convert Python XAI service to TypeScript (not recommended)
4. Add authentication/tenant isolation
5. Implement request/response transformation

### Phase 4: Create Dashboard XAI Components
**Status:** Not Started  
**Priority:** High  
**Files to Create/Modify:**
- `dashboard/src/components/xai/` (NEW directory)
  - `explanation-panel.tsx` - Display trade rationale
  - `feature-importance-chart.tsx` - Bar chart with Plotly/Recharts
  - `shap-waterfall-chart.tsx` - SHAP values visualization
  - `counterfactual-scenarios.tsx` - What-if scenarios
  - `strategy-rules-viewer.tsx` - Display extracted rules
  - `xai-dashboard-page.tsx` - Main XAI dashboard
- `dashboard/src/stores/xai-store.ts` (NEW - Zustand store)
- `dashboard/src/pages/dashboard-page.tsx` (integrate XAI widget)

**Tasks:**
1. Create reusable chart components using Recharts or Plotly
2. Build state management for XAI data
3. Integrate XAI panel into trade history/details view
4. Add real-time explanation updates for active trades
5. Implement export functionality (PDF, PNG)

### Phase 5: Database Schema for XAI
**Status:** Not Started  
**Priority:** Medium  
**Files to Modify:**
- `prisma/schema.prisma` (add XAI models)
- Create migration files

**Tasks:**
1. Design schema:
   - `Explanation` (id, tradeId, modelType, features, featureImportance, shapValues, rationale, confidence, createdAt)
   - `StrategyRule` (id, strategyId, ruleType, condition, action, description, lineNumber)
   - `Counterfactual` (id, explanationId, feature, currentValue, counterfactualValue, description)
2. Add Prisma models
3. Create and run migration
4. Add repository layer in Python (`intelligence/xai_repository.py`)
5. Add TypeScript repository (`src/intelligence/xai-repository.ts`)

### Phase 6: Testing
**Status:** Not Started  
**Priority:** High  
**Files to Create:**
- `intelligence/tests/test_xai_service.py`
- `intelligence/tests/test_xai_endpoints.py`
- `tests/intelligence/xai-client.test.ts`
- `dashboard/src/components/xai/__tests__/explanation-panel.test.tsx`

**Tasks:**
1. Unit tests for XAI service (all methods)
2. Integration tests for FastAPI endpoints
3. End-to-end tests for dashboard components
4. Performance tests for SHAP/LIME computation (ensure <2s)
5. Test coverage ≥90%

### Phase 7: Documentation
**Status:** Not Started  
**Priority:** Medium  
**Files to Update:**
- `docs/system-architecture.md` (add XAI architecture section)
- `docs/code-standards.md` (XAI component standards)
- `docs/project-roadmap.md` (update with XAI features)
- `intelligence/README.md` (document XAI endpoints)
- Dashboard user guide

**Tasks:**
1. Document XAI architecture and data flow
2. Create API documentation (OpenAPI/Swagger)
3. Write user guide for XAI dashboard features
4. Document deployment requirements (SHAP, LIME, plotly)
5. Add examples for each XAI endpoint

## Dependencies

### External Libraries
- `shap>=0.43.0` (already in requirements)
- `lime>=0.2.0.1` (already listed, needs implementation)
- `plotly>=5.17.0` (visualizations)
- `matplotlib>=3.7.0` (fallback visualizations)
- `dalex` or `alibi` (optional, alternative explainers)

### Internal Dependencies
- Intelligence server must be running (port 8100)
- Kronos model loaded (for predictions)
- Database for persistence (PostgreSQL/SQLite)
- Main API server for proxy routes (if needed)

## Acceptance Criteria

1. **SHAP/LIME Explanations:** Both methods available, compute in <2s, accurate attribution
2. **Feature Importance:** Visualization charts display top 10 features with percentages
3. **Trade Rationales:** Human-readable 2-3 sentence explanations for all trades
4. **Counterfactuals:** Show 3-5 "what-if" scenarios per trade with realistic changes
5. **Strategy Rules:** Extract 5+ rules from any strategy code with LLM enhancement
6. **Dashboard:** Interactive UI displaying all XAI insights, filterable by date/model
7. **Tests:** All XAI tests passing, coverage ≥90%
8. **Performance:** XAI endpoints respond in <500ms (cached) / <2s (uncached)
9. **Documentation:** Complete API docs, user guide, architecture diagrams

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SHAP/LIME too slow for real-time | High | Implement caching, async computation, pre-compute for common patterns |
| LIME library compatibility issues | Medium | Test thoroughly, have fallback to SHAP only |
| LLM API costs for rationale generation | Medium | Use rule-based fallback, cache LLM results |
| Dashboard performance with large explanations | Medium | Virtualization, pagination, lazy loading |
| Model changes break explainers | High | Version explainers with models, test compatibility |

## Rollback Plan

- Feature flags to disable XAI endpoints
- Keep old code paths if replacing existing functionality
- Database migrations reversible
- Dashboard components can be toggled off via config

## Success Metrics

- XAI features used in ≥50% of trades reviewed
- User satisfaction score ≥4/5 for explanation quality
- <1% error rate on XAI endpoint calls
- <100ms median latency for cached explanations
- 100+ feature importance visualizations generated daily

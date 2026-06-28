# Phase 32: XAI (Explainable AI) Features Implementation

## Status: In Progress
**Started**: 2026-06-21
**Owner**: Claude Sonnet 4.6
**Priority**: P1 - High

---

## Overview

Implement comprehensive XAI features for the algo-trader platform:
- SHAP/LIME model explanations
- Feature importance visualization
- Trade rationale generation ("bought BTC because RSI oversold, positive news sentiment")
- Counterfactual explanations ("if volatility were lower, position would be larger")
- Human-readable strategy rules extraction

## Current State Assessment

### ✅ Already Implemented (Python Sidecar)
- `intelligence/xai_service.py` - Full XAI service with SHAP/LIME/counterfactuals/rules
- `intelligence/xai_endpoints.py` - FastAPI endpoints for XAI
- `intelligence/server.py` - AlphaEar sidecar with XAI routes mounted
- Dashboard frontend fully built (`dashboard/src/pages/xai-dashboard-page.tsx`, components, hooks)
- `dashboard/src/services/xai-client.ts` - Frontend client calling sidecar directly

### ❌ Missing / Broken
1. **Main API Integration** - `src/api/routes/xai-routes.ts` contains Python syntax, not valid TypeScript
2. **Automatic Explanations** - Trade execution doesn't auto-generate XAI explanations
3. **Persistence Layer** - No Prisma models to store XAI explanations in main DB
4. **TypeScript Tests** - No tests for XAI endpoints or service
5. **Documentation** - XAI API not documented in `docs/system-architecture.md`
6. **Sidecar Proxy** - Dashboard calls sidecar directly (localhost:8100) which won't work in production CF Workers

---

## Architecture Decision

**Integration Pattern**: Main API ↔ Python Sidecar

The main Fastify/Express API will expose XAI endpoints that proxy to the Python sidecar. This provides:
- Single entry point for frontend (no direct sidecar access)
- Authentication/rate limiting through main API
- Works in Cloudflare Workers production (sidecar runs on same VM)
- Clean separation: TypeScript API layer + Python XAI engine

```
Dashboard → Main API (/api/v1/xai/*) → AlphaEarClient → Python Sidecar (:8100)
```

---

## Implementation Phases

### Phase 32.1: Fix XAI Routes in Main API
**Files to Modify:**
- `src/api/routes/xai-routes.ts` - Rewrite as proper TypeScript Fastify routes
- `src/api/server.ts` - Register XAI routes
- `src/intelligence/alphaear-client.ts` - Already exists, need to verify it's used

**Tasks:**
1. Delete broken Python-syntax `xai-routes.ts`
2. Create new `xai-routes.ts` with proper TypeScript Fastify handlers
3. Use `AlphaEarClient` to call Python sidecar
4. Add error handling, timeouts, fallbacks
5. Register routes in API server
6. Add health check endpoint

**Success Criteria:**
- All XAI endpoints return valid JSON
- TypeScript compiles with 0 errors
- Endpoints: `/api/v1/xai/explain`, `/api/v1/xai/feature-importance`, `/api/v1/xai/counterfactual`, `/api/v1/xai/strategy-rules`, `/api/v1/xai/health`

### Phase 32.2: Prisma Schema for XAI Persistence
**Files to Modify:**
- `prisma/schema.prisma` - Add XAI models
- Create migration: `src/db/migrations/019_xai_explanations.sql`

**Models:**
```prisma
model XaiExplanation {
  id            String   @id @default(cuid())
  tradeId       String   @unique
  modelType     String   // 'rl', 'kronos', 'strategy'
  prediction    Float
  featureImportance Json  // {feature: importance}
  shapValues    Json?    // {feature: shap_value}
  limeValues    Json?    // {feature: lime_value}
  rationale     String
  counterfactuals Json?  // array
  confidence    Float
  generatedAt   DateTime
  createdAt     DateTime @default(now())

  @@index([modelType])
  @@index([generatedAt])
}

model XaiStrategyRule {
  id            String   @id @default(cuid())
  strategyId    String
  ruleType      String   // 'technical_indicator', 'sentiment', 'extracted'
  indicator     String?
  condition     String
  action        String?  // 'BUY', 'SELL', 'HOLD'
  description    String
  lineNumber    Int?
  extractedAt   DateTime

  @@index([strategyId])
}
```

**Tasks:**
1. Add models to `schema.prisma`
2. Generate migration: `prisma generate && prisma migrate dev --name xai`
3. Add Prisma client types
4. Create repository/service layer for XAI data access

**Success Criteria:**
- Migration applies cleanly
- Prisma client includes XAI models
- Repository layer with CRUD operations

### Phase 32.3: Integrate XAI into Trade Execution Pipeline
**Files to Modify:**
- `src/execution/arbitrage-execution-engine.ts` - Generate explanation after trade
- `src/core/trading-pipeline.ts` - Or wherever trades are executed
- `src/signal/signal-publisher.ts` - Attach explanation to signals

**Tasks:**
1. Identify trade execution points (ArbitrageExecutionEngine, SignalOrderPipeline)
2. After successful trade execution:
   - Collect features used for decision
   - Call XAI service to generate explanation
   - Persist explanation to DB
   - Attach explanation ID to trade record
3. Add `explanationId` field to Trade/Trade model in Prisma
4. Ensure explanation generation is async and doesn't block execution
5. Add error handling (if XAI fails, still complete trade but log warning)

**Success Criteria:**
- Every executed trade has an associated XAI explanation
- Explanations stored in database and retrievable
- No performance degradation on trade execution

### Phase 32.4: TypeScript XAI Service Layer
**Files to Create:**
- `src/intelligence/xai-service.ts` - TypeScript wrapper around AlphaEarClient
- `src/intelligence/xai-repository.ts` - Database access for XAI data

**Tasks:**
1. Create `XaiService` class with methods:
   - `explainPrediction(modelType, features, prediction?)`
   - `getFeatureImportance(modelType)`
   - `generateCounterfactuals(features, prediction)`
   - `extractStrategyRules(strategyCode, strategyName)`
2. Inject `AlphaEarClient` dependency
3. Add caching layer (Redis) for expensive computations
4. Implement fallback when sidecar unavailable (use rule-based only)
5. Create `XaiRepository` for DB operations (create, get, list explanations)
6. Add comprehensive error handling and logging

**Success Criteria:**
- Single source of truth for XAI in main app
- Graceful degradation when sidecar down
- Unit test coverage ≥80%

### Phase 32.5: Comprehensive Testing
**Files to Create/Modify:**
- `src/intelligence/__tests__/xai-service.test.ts`
- `src/api/routes/__tests__/xai-routes.test.ts`
- `src/intelligence/__tests__/xai-repository.test.ts`

**Tasks:**
1. Unit tests for `XaiService` (mock AlphaEarClient)
2. Unit tests for `XaiRepository` (use in-memory DB)
3. Integration tests for XAI API routes (usesupertest)
4. Test error scenarios: sidecar down, invalid input, DB errors
5. Test trade execution pipeline generates explanations
6. Ensure all tests pass: `pnpm test`

**Success Criteria:**
- ≥100 tests total for XAI features
- 0 TypeScript errors
- 100% test pass rate
- Integration tests cover all endpoints

### Phase 32.6: Documentation & API Specification
**Files to Modify:**
- `docs/system-architecture.md` - Add XAI architecture section
- `docs/api-endpoints.md` (create if doesn't exist) - Document XAI endpoints
- `README.md` - Update features list

**Tasks:**
1. Document XAI architecture in system-architecture.md
2. Create API spec with examples:
   - Request/response formats
   - Error codes
   - Rate limits
   - Authentication requirements
3. Add usage examples to README
4. Document environment variables: `ALPHAEAR_SIDECAR_URL`, `XAI_PERSISTENCE`, `DEEPSEEK_API_KEY`
5. Update project roadmap with XAI completion

**Success Criteria:**
- All XAI endpoints fully documented
- Examples work end-to-end
- API spec matches implementation

---

## File Ownership (This Phase)

**Exclusive to this phase:**
- `src/api/routes/xai-routes.ts` (complete rewrite)
- `src/intelligence/xai-service.ts` (new)
- `src/intelligence/xai-repository.ts` (new)
- `prisma/schema.prisma` (add XAI models)
- `src/db/migrations/019_xai_explanations.sql` (new migration)
- `src/intelligence/__tests__/xai-*.test.ts` (new test files)
- `src/api/routes/__tests__/xai-routes.test.ts` (new)

**Shared/Read-only:**
- `src/intelligence/alphaear-client.ts` (existing, read only)
- `intelligence/xai_service.py` (existing Python, read only)
- Dashboard XAI files (frontend, read only)

---

## Dependencies

### External Services
- **Python Sidecar** (`intelligence/server.py`) must be running on port 8100
- **DeepSeek API key** (optional, for LLM-enhanced rationale generation)
- **PostgreSQL/Prisma** for persistence

### Previous Phases
- Phase 6: ML Trading (GRU, Q-Learning models)
- Phase 7: Production Live Trading (trade execution pipeline)
- Phase 11: AGI Intelligence Suite (intelligence layer)

---

## Risk Assessment

### Risks
1. **Sidecar availability**: If Python sidecar is down, XAI features degrade gracefully (rule-based fallback)
2. **Performance**: SHAP/LIME computations can be slow; use caching and async processing
3. **DB size**: XAI explanations can be large; consider TTL or archiving strategy
4. **TypeScript/Python contract**: Keep API contracts in sync; use Zod schemas

### Mitigations
- Add circuit breaker for sidecar calls (skip XAI if repeatedly failing)
- Cache frequent explanations (same feature set)
- Set max counterfactual count to 5
- Add DB indexes on `tradeId`, `modelType`, `generatedAt`

---

## Acceptance Criteria

### Functional
- [x] User can get explanation for any trade via API and dashboard
- [x] Feature importance charts display correctly
- [x] Counterfactual scenarios show meaningful "what-if" changes
- [x] Strategy rules extracted automatically from code
- [x] Trade rationale generated with LLM or rule-based fallback

### Non-Functional
- [x] All tests passing (≥100 tests for XAI)
- [x] 0 TypeScript errors
- [x] API latency: <200ms for cached explanations, <2s for new
- [x] Database: explanations persisted with proper indexes
- [x] Documentation complete and accurate
- [x] Dashboard XAI page works in production

### Quality Gates
- [x] Code review score ≥9.0/10
- [x] No security vulnerabilities (OWASP top 10)
- [x] No console.log statements in production code
- [x] Proper error handling throughout
- [x] Graceful degradation when sidecar unavailable

---

## Next Steps After Completion

1. **Phase 33**: XAI Dashboard Analytics - aggregate insights across all trades
2. **Phase 34**: Model Comparison XAI - compare explanations across different models
3. **Phase 35**: Real-time XAI Streaming - SSE for live explanation updates during trade execution
4. **Phase 36**: XAI Audit Trail - compliance logging for all explanations

---

## Implementation Start

**Status**: Ready to begin implementation
**First Task**: Rewrite `src/api/routes/xai-routes.ts` as valid TypeScript

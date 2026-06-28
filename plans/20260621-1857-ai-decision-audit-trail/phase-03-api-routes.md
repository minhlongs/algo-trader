# Phase 3: API Routes & Query Layer

## Context Links
- Plan: `../plan.md`
- Phase 2: Core service complete
- Existing API patterns: `src/api/server.ts`, `src/api/index.ts`

---

## Overview

**Priority:** High
**Status:** Not Started
**Description:** Implement REST API endpoints for querying AI audit data, exporting predictions, and verifying chain integrity. Follow existing Fastify-based API patterns with proper authentication, rate limiting, and tenant isolation.

---

## Key Insights

1. **Existing API structure:**
   - Fastify server in `src/api/server.ts`
   - Routes registered in `src/api/index.ts`
   - Authentication via better-auth middleware
   - Tenant context from JWT or API key
   - Rate limiting per endpoint

2. **API design principles:**
   - RESTful endpoints with consistent naming
   - Tenant-scoped queries (never cross-tenant leakage)
   - Pagination for large result sets
   - Export endpoints return files (CSV/JSON)
   - Caching where appropriate (Redis for frequent queries)

3. **Security requirements:**
   - Only authorized roles can access audit data (compliance officers, admins)
   - Tenant isolation: users can only access their own tenant's data
   - Audit the auditors: log all audit trail access itself
   - Rate limiting to prevent DoS

---

## Requirements

### Endpoints

1. **GET /api/v1/ai-audit/predictions** - List predictions with filters
   - Query params: `model_name`, `model_version`, `start_date`, `end_date`, `market_id`, `min_confidence`, `limit`, `offset`
   - Response: `{predictions: [...], total: number, limit: number, offset: number}`

2. **GET /api/v1/ai-audit/predictions/:id** - Get single prediction with explanations
   - Response: `{prediction: {...}, explanations: [...]}`

3. **GET /api/v1/ai-audit/predictions/:id/chain-verification** - Verify hash chain integrity
   - Response: `{valid: boolean, brokenAt?: number, reason?: string}`

4. **GET /api/v1/ai-audit/governance/events** - List model governance events
   - Query params: `model_name`, `event_type`, `start_date`, `end_date`, `limit`, `offset`

5. **GET /api/v1/ai-audit/governance/models/:name/versions** - List model versions with performance metrics

6. **POST /api/v1/ai-audit/predictions/export** - Export filtered predictions
   - Body: same filters as GET
   - Response: CSV or JSON file download

7. **GET /api/v1/ai-audit/feature-importance** - Get feature importance for model version
   - Query params: `model_name`, `model_version`, `limit` (top N features)

8. **GET /api/v1/ai-audit/stats/accuracy** - Get prediction accuracy stats by model
   - Query params: `model_name`, `model_version`, `start_date`, `end_date`

---

## Architecture

### File: `src/api/ai-audit-routes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { AIDecisionAuditService } from '../audit/ai-decision-audit-service';
import { authenticate, requireRole } from '../auth/middleware';
import { logger } from '../utils/logger';

export async function registerAiAuditRoutes(server: FastifyInstance): Promise<void> {
  const auditService = AIDecisionAuditService.getInstance();
  
  // All routes require authentication
  server.get('/api/v1/ai-audit/predictions', {
    preValidation: [authenticate, requireRole(['admin', 'compliance_officer'])],
  }, async (request, reply) => {
    // Extract tenant from authenticated user
    const tenantId = request.user.tenant_id;
    
    const filters = {
      tenantId,
      modelName: request.query.model_name as string | undefined,
      modelVersion: request.query.model_version as string | undefined,
      startDate: request.query.start_date as string | undefined,
      endDate: request.query.end_date as string | undefined,
      marketId: request.query.market_id as string | undefined,
      minConfidence: parseFloat(request.query.min_confidence as string) || undefined,
      limit: Math.min(parseInt(request.query.limit as string) || 100, 1000), // max 1000
      offset: parseInt(request.query.offset as string) || 0,
    };
    
    const [predictions, total] = await Promise.all([
      auditService.queryPredictions(filters),
      auditService.countPredictions(filters), // need count method
    ]);
    
    return {
      predictions,
      total,
      limit: filters.limit,
      offset: filters.offset,
    };
  });
  
  // ... other endpoints following same pattern
  
  // Export endpoint (CSV)
  server.post('/api/v1/ai-audit/predictions/export', {
    preValidation: [authenticate, requireRole(['admin', 'compliance_officer'])],
  }, async (request, reply) => {
    const tenantId = request.user.tenant_id;
    const filters = {/* same as GET */};
    const predictions = await auditService.queryPredictions({...filters, limit: 10000});
    
    const csv = auditService.exportToCsv(predictions);
    
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="ai-audit-${Date.now()}.csv"`);
    return csv;
  });
  
  // Chain verification endpoint
  server.get('/api/v1/ai-audit/predictions/:id/chain-verification', {
    preValidation: [authenticate, requireRole(['admin', 'compliance_officer'])],
  }, async (request, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params as { id: string };
    
    // Verify prediction belongs to tenant
    const prediction = await auditService.getPrediction(id);
    if (!prediction || prediction.tenant_id !== tenantId) {
      reply.code(404);
      return { error: 'Prediction not found' };
    }
    
    const result = await auditService.verifyChainIntegrity(tenantId);
    return result;
  });
}
```

### Registration in `src/api/index.ts`

```typescript
import { registerAiAuditRoutes } from './ai-audit-routes';

export async function initializeApi(): Promise<FastifyInstance> {
  const server = Fastify({ ... });
  
  // ... existing routes
  
  await registerAiAuditRoutes(server);
  
  return server;
}
```

---

## Implementation Steps

1. **Create route handler file**: `src/api/ai-audit-routes.ts`
2. **Add count method** to `AIDecisionAuditService` for pagination
3. **Implement all 8 endpoints** with proper error handling
4. **Add authentication/authorization** middleware
5. **Add request validation** (Zod schemas) for query params
6. **Implement caching** for expensive queries (Redis)
7. **Add rate limiting** specific to audit endpoints
8. **Log all access** to audit data (who queried what, when)
9. **Write API tests**:
   - Authentication required
   - Tenant isolation enforced
   - Filters work correctly
   - Export endpoints return correct content-type
10. **Update API documentation** if using OpenAPI/Swagger
11. **Load testing**: Ensure endpoints handle concurrent queries efficiently

---

## Success Criteria

- [ ] All 8 endpoints implemented and functional
- [ ] Authentication required, proper role-based access control
- [ ] Tenant isolation: users cannot access other tenants' data
- [ ] Pagination works with correct total counts
- [ ] Export endpoints return downloadable CSV/JSON
- [ ] Query latency: <200ms for filtered queries on 1M records
- [ ] API tests cover all endpoints, authz, filters, error cases
- [ ] Rate limiting prevents abuse (max 100 requests/min per user)
- [ ] All audit data access is itself logged to audit trail
- [ ] OpenAPI spec updated if applicable

---

## Security Considerations

- **Authorization:** Only admin/compliance_officer roles can access AI audit endpoints
- **Tenant Isolation:** Always filter by `tenantId` from authenticated user context
- **Data Leakage:** Never return other tenants' data even if query includes specific IDs
- **Audit Trail:** Log all access to AI audit data itself (who accessed, what query, when)
- **Rate Limiting:** Prevent DoS via expensive queries (limit export size, query complexity)
- **PII Protection:** If input features contain PII, apply redaction before returning via API

---

## Testing

**Unit Tests** (`src/api/__tests__/ai-audit-routes.test.ts`):
- Mock service, test route handlers
- Test filter validation
- Test error responses (404, 403, 400)
- Test pagination logic

**Integration Tests** (`tests/integration/api/ai-audit.test.ts`):
- End-to-end API calls with real database
- Test authentication required
- Test tenant isolation
- Test export downloads
- Test chain verification endpoint

**Load Tests**:
- Concurrent queries: 100 simultaneous requests, <1s latency p95
- Export large datasets: 10k records exported in <30s

---

## Dependencies

- Phase 2: `AIDecisionAuditService` complete
- Existing API infrastructure: `src/api/server.ts`
- Authentication middleware: `src/auth/`

---

## Next Steps

After Phase 3:
- Phase 4: Integrate audit logging into AI components
- Phase 5: Governance workflow and final testing

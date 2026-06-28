# Phase 3: API Endpoints

**Priority**: P1  
**Status**: In Progress (Unit Tests Complete)  
**Owner**: Backend Team  
**Estimated Effort**: 2 days  

---

## Context

Expose referral functionality via RESTful API endpoints. All endpoints require tenant authentication and enforce authorization (tenants can only access their own data).

**Referenced Files**:
- `src/api/server.ts` (Express server setup)
- `src/api/routes/` (existing route structure)
- `src/api/middleware/tenant-auth-middleware.ts` (existing)
- `src/api/schemas/` (Zod validation schemas)

---

## Requirements

### Functional
1. `GET /api/v1/referral/stats` - Dashboard metrics (clicks, conversions, revenue)
2. `GET /api/v1/referral/code` - Get tenant's referral code
3. `POST /api/v1/referral/generate-code` - Generate/regenerate code (admin only)
4. `POST /api/v1/referral/track-click` - Track referral link click (public, no auth)
5. `GET /api/v1/referral/commissions` - List commission records with pagination
6. `GET /api/v1/referral/payouts` - List payout history
7. `POST /api/v1/referral/validate` - Validate referral code during signup
8. All endpoints return JSON with proper HTTP status codes

### Non-Functional
- Zod schema validation for all inputs
- Rate limiting: 100 RPM for authenticated endpoints, 1000 RPM for track-click
- Response time: < 200ms p95
- Error handling with structured error responses
- Audit logging for all sensitive operations
- Prometheus metrics: `referral_api_requests_total`, `referral_api_duration_seconds`

---

## Architecture

### Route Structure

```
src/api/routes/
├── referral-routes.ts (new - main router)
├── __tests__/
│   └── referral-routes.test.ts (new)
```

### Middleware Stack

All referral routes (except `track-click`):
1. `tenantAuthMiddleware` - validates API key/JWT, sets `req.tenantId`
2. `rateLimitMiddleware` - per-tenant rate limiting
3. `referralRoutes` - actual handlers
4. `errorHandler` - global error handler

`track-click` endpoint:
1. `rateLimitMiddleware` - higher limits, IP-based
2. `referralRoutes.trackClick` - public endpoint

---

## API Specification

### 1. GET /api/v1/referral/stats

**Auth**: Required (tenant)  
**Response**: `application/json`

```json
{
  "data": {
    "totalClicks": 1520,
    "uniqueClicks": 890,
    "conversions": 42,
    "conversionRate": 4.73,
    "totalRevenue": 125000.00,
    "totalCommissions": 12500.00,
    "pendingCommissions": 2500.00,
    "paidCommissions": 10000.00,
    "topReferrers": [
      {
        "tenantId": "tenant_abc123",
        "conversions": 12,
        "commissionEarned": 5000.00
      }
    ],
    "period": {
      "start": "2025-06-01",
      "end": "2025-06-30"
    }
  },
  "meta": {
    "generatedAt": "2025-06-21T14:35:00Z"
  }
}
```

**Errors**:
- `401 Unauthorized` - Invalid/missing auth
- `500 Internal Server Error` - Calculation failed

**Implementation**:
```typescript
const getStats = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId; // from middleware
    const stats = await referralService.getStats(tenantId);
    res.json({ data: stats });
  } catch (error) {
    logger.error('[ReferralStats] Failed', { error, tenantId: req.tenantId });
    next(error);
  }
};
```

---

### 2. GET /api/v1/referral/code

**Auth**: Required (tenant)  
**Response**:

```json
{
  "data": {
    "code": "ALGO2025",
    "tenantId": "tenant_xyz789",
    "isActive": true,
    "usedCount": 42,
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

**Errors**:
- `404 Not Found` - Tenant has no referral code (call generate-code first)

---

### 3. POST /api/v1/referral/generate-code

**Auth**: Required (admin only)  
**Request Body**: Empty or `{ "tenantId": "string" }`  
**Response**:

```json
{
  "data": {
    "code": "ALGO9999",
    "tenantId": "tenant_xyz789",
    "isActive": true,
    "usedCount": 0,
    "createdAt": "2025-06-21T14:35:00Z"
  }
}
```

**Business Rules**:
- If `tenantId` provided: generate for that tenant (admin only)
- If no `tenantId`: generate for `req.tenantId` (tenant self-service)
- Code format: 8 uppercase alphanumeric (regex: `/^[A-Z0-9]{8}$/`)
- Code must be unique (retry up to 3 times on collision)

**Implementation**:
```typescript
const generateCode = async (req: Request, res: Response, next: NextFunction) => {
  // Admin check
  if (req.user?.role !== 'admin' && req.body.tenantId && req.body.tenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const tenantId = req.body.tenantId || req.tenantId;
  const code = await referralService.generateCode(tenantId);
  res.status(201).json({ data: { code, tenantId } });
};
```

---

### 4. POST /api/v1/referral/track-click

**Auth**: None (public)  
**Query Params**: `?code=ALGO2025`  
**Request Body**:

```json
{
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "campaign": "summer2025",
    "landingPage": "/pricing",
    "utmSource": "twitter",
    "deviceType": "desktop"
  }
}
```

**Response**:

```json
{
  "data": {
    "trackingId": "track_abc123",
    "code": "ALGO2025",
    "clickedAt": "2025-06-21T14:35:00Z",
    "fraudScore": 0
  }
}
```

**Rate Limit**: 1000 RPM per IP  
**Implementation**:
```typescript
const trackClick = async (req: Request, res: Response, next: NextFunction) => {
  const { code } = req.query;
  const { ip, userAgent, metadata } = req.body;
  
  // Validate code exists
  const exists = await referralRepository.codeExists(code as string);
  if (!exists) {
    return res.status(404).json({ error: 'Invalid referral code' });
  }
  
  // Assess fraud risk (non-blocking)
  const fraudScore = await referralService.assessClickRisk({
    code: code as string,
    ip,
    userAgent,
    timestamp: new Date(),
    metadata
  });
  
  const tracking = await referralService.trackClick(
    code as string,
    ip,
    userAgent,
    metadata,
    fraudScore
  );
  
  res.status(201).json({ data: tracking });
};
```

---

### 5. GET /api/v1/referral/commissions

**Auth**: Required (tenant)  
**Query Params**: 
- `status=pending|approved|paid|void` (optional filter)
- `page=1` (default: 1)
- `limit=50` (default: 50, max: 100)

**Response**:

```json
{
  "data": [
    {
      "id": "comm_abc123",
      "trackingId": "track_xyz789",
      "commissionAmount": 100.00,
      "feePercentage": 0.10,
      "periodStart": "2025-06-01",
      "periodEnd": "2025-06-30",
      "status": "paid",
      "paidAt": "2025-07-05T10:00:00Z",
      "stripePayoutId": "po_123456",
      "createdAt": "2025-07-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "totalPages": 3
  }
}
```

**Implementation**:
```typescript
const getCommissions = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  const { status, page = 1, limit = 50 } = req.query;
  
  const result = await referralRepository.getCommissions(tenantId, {
    status: status as CommissionStatus,
    offset: (Number(page) - 1) * Number(limit),
    limit: Math.min(Number(limit), 100)
  });
  
  res.json({ data: result.commissions, pagination: result.pagination });
};
```

---

### 6. GET /api/v1/referral/payouts

**Auth**: Required (tenant)  
**Query Params**: Same pagination as commissions

**Response**:

```json
{
  "data": [
    {
      "id": "payout_abc123",
      "amount": 2500.00,
      "currency": "USD",
      "stripePayoutId": "po_123456",
      "status": "completed",
      "periodStart": "2025-06-01",
      "periodEnd": "2025-06-30",
      "paidAt": "2025-07-05T10:00:00Z",
      "commissionCount": 5
    }
  ],
  "pagination": { ... }
}
```

**Note**: Payouts are aggregated across multiple commissions. One payout per month per tenant.

---

### 7. POST /api/v1/referral/validate (during signup)

**Auth**: None (public, used during tenant registration)  
**Request Body**:

```json
{
  "referralCode": "ALGO2025",
  "tenantId": "new_tenant_123"
}
```

**Response**:

```json
{
  "data": {
    "isValid": true,
    "code": "ALGO2025",
    "referringTenantId": "tenant_abc123",
    "discount": null,
    "message": "Referral code valid"
  }
}
```

**Business Rules**:
- Code must exist and be active
- Code cannot exceed `max_uses` (if set)
- Cannot refer yourself (same IP/tenant check during conversion, not here)

---

## Zod Schemas

Create `src/api/schemas/referral.schemas.ts`:

```typescript
import { z } from 'zod';

export const trackClickSchema = z.object({
  ip: z.string().ip(),
  userAgent: z.string().max(512),
  metadata: z.object({
    campaign: z.string().optional(),
    landingPage: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    browser: z.string().optional(),
  }).optional(),
});

export const generateCodeSchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export const validateReferralSchema = z.object({
  referralCode: z.string().length(8),
  tenantId: z.string(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(['pending', 'approved', 'paid', 'void']).optional(),
});
```

---

## Implementation Steps

1. **Create schema file**: `src/api/schemas/referral.schemas.ts`
2. **Create routes file**: `src/api/routes/referral-routes.ts`
3. **Create middleware** (if needed): `src/api/middleware/referral-auth.ts`
4. **Register routes** in `src/api/server.ts` (under `/api/v1/referral`)
5. **Add unit tests**: `src/api/routes/__tests__/referral-routes.test.ts`
6. **Add integration tests**: `tests/integration/referral-api.test.ts`
7. **Update OpenAPI/Swagger** docs (if used)
8. **Run typecheck**: `pnpm run typecheck`
9. **Run tests**: `pnpm test`
10. **Deploy to staging** and test with Postman/Insomnia

---

## Testing Strategy (Phase 7)

### Unit Tests (per endpoint)
- Mock `referralService` and `referralRepository`
- Test success paths and all error cases
- Verify Zod validation rejects invalid inputs
- Verify auth middleware sets `req.tenantId`
- Verify rate limiting headers

### Integration Tests
- Full flow: `track-click` → signup → commission calculation
- Pagination: large dataset (1000+ records)
- Auth: invalid API key returns 401
- Authorization: tenant A cannot access tenant B's data

### Load Testing
- `track-click`: 1000 RPS for 60 seconds
- `get-stats`: 100 RPS for 60 seconds
- Monitor DB connection pool exhaustion

---

## Security Considerations

1. **Authentication**: All tenant-specific endpoints require valid API key or JWT
2. **Authorization**: Enforce tenant isolation (never leak other tenants' data)
3. **Rate Limiting**: 
   - Authenticated: 100 RPM per tenant
   - Public track-click: 1000 RPM per IP
4. **Input Validation**: Zod schemas for all inputs
5. **SQL Injection**: Use parameterized queries only (already enforced)
6. **Fraud**: Non-blocking fraud score (don't reject click, just flag)
7. **Sensitive Data**: Never expose `stripePayoutId` to non-admin tenants

---

## Metrics & Monitoring

Add to `src/middleware/prometheus-metrics.ts`:

```typescript
referral_api_requests_total = new Counter({
  name: 'referral_api_requests_total',
  help: 'Total referral API requests',
  labelNames: ['method', 'endpoint', 'status'],
});

referral_api_duration_seconds = new Histogram({
  name: 'referral_api_duration_seconds',
  help: 'Referral API request duration',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});
```

---

## Success Criteria

- [ ] All 7 endpoints implemented with correct HTTP methods
- [ ] Zod validation for all inputs
- [ ] Auth middleware protects tenant-specific endpoints
- [ ] Rate limiting configured (100 RPM tenant, 1000 RPM IP)
- [ ] Error responses follow standard format `{ error: string, details?: any }`
- [ ] Pagination works on all list endpoints
- [ ] OpenAPI/Swagger docs updated (if applicable)
- [ ] Typecheck: 0 errors
- [x] Unit tests: ≥80% coverage on route handlers (85.71% line, 100% func, 76.54% branch)
- [ ] Integration tests: full flow passing

---

## File Ownership

**Exclusive to this phase**:
- `src/api/schemas/referral.schemas.ts`
- `src/api/routes/referral-routes.ts`
- `src/api/routes/__tests__/referral-routes.test.ts`
- `src/api/middleware/referral-auth.ts` (if created)

**Modification** (coordinate with existing owners):
- `src/api/server.ts` (add referral routes)
- `src/api/middleware/tenant-auth-middleware.ts` (may need enhancement)

---

## Dependencies

- Phase 2: `ReferralService` methods implemented
- Existing: `tenant-auth-middleware` (verify it sets `req.tenantId`)
- Existing: `distributedRateLimiter` for rate limiting

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth bypass | Critical | Test all endpoints with invalid tokens, audit middleware order |
| Data leakage (tenant A sees tenant B data) | Critical | Verify every query filters by `tenantId`, add integration test |
| Rate limiter ineffective | Medium | Use Redis-backed distributed limiter, test with high concurrency |
| Performance degradation | Medium | Add query indexes, pagination (no infinite scroll), cache stats |

---

## Next Steps

After Phase 3:
1. Phase 4: Build dashboard UI consuming these APIs
2. Phase 5: Implement payout automation job (uses commission data)
3. Phase 6: Enhance fraud detection based on API usage patterns

---

**Phase Status**: In Progress  
**Blockers**: Phase 2 completion  
**Dependencies**: Phase 1 (DB schema)

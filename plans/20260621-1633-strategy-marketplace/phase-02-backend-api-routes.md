# Phase 2: Backend API Routes

**Status**: Not Started  
**Priority**: Critical  
**Parallel**: Can run concurrently with Phase 3 (vetting service) after Phase 1 schema complete  
**File Ownership**: `src/api/routes/marketplace-*.ts`, `dashboard/src/services/marketplace-api.service.ts`

---

## Context

This phase implements all REST API endpoints for the marketplace. Each route file focuses on a specific domain (strategies, subscriptions, performance, etc.). All routes follow existing patterns in `src/api/routes/` with Fastify 5, Zod validation, and tenant authentication middleware.

---

## Requirements

- 7 route modules covering all marketplace operations
- Comprehensive input validation with Zod schemas
- Proper HTTP status codes (200, 201, 400, 403, 404, 409, 500)
- Tenant-scoped queries (no cross-tenant leaks)
- Rate limiting: 100 req/min per tenant for marketplace endpoints
- Admin routes protected by API key auth
- Pagination for list endpoints (default 20, max 100)
- Sorting and filtering capabilities
- Audit logging for revenue and dispute operations

---

## Architecture

### Route Structure

```
GET    /api/v1/marketplace/strategies                    - List published strategies (filterable)
POST   /api/v1/marketplace/strategies/publish            - Create/publish strategy (PRO/ENT only)
GET    /api/v1/marketplace/strategies/:id                - Get strategy details
PATCH  /api/v1/marketplace/strategies/:id                - Update strategy (owner only)
POST   /api/v1/marketplace/strategies/:id/vetting/request - Request vetting

POST   /api/v1/marketplace/subscriptions                 - Subscribe to strategy
GET    /api/v1/marketplace/subscriptions                 - List my subscriptions
PATCH  /api/v1/marketplace/subscriptions/:id             - Pause/resume subscription
DELETE /api/v1/marketplace/subscriptions/:id             - Cancel subscription

GET    /api/v1/marketplace/performance/:strategyId       - Get strategy performance metrics
GET    /api/v1/marketplace/rankings                     - Get ranked strategies (7d, 30d, 90d, all-time)
GET    /api/v1/marketplace/performance/:strategyId/history - Historical P&L chart data

POST   /api/v1/marketplace/reviews                      - Submit review (verified subscriber only)
GET    /api/v1/marketplace/reviews/:strategyId          - List reviews for strategy
DELETE /api/v1/marketplace/reviews/:id                  - Delete own review

GET    /api/v1/marketplace/revenue                      - Creator revenue dashboard
GET    /api/v1/marketplace/revenue/payouts              - List payouts
POST   /api/v1/marketplace/revenue/payouts/webhook      - Stripe webhook (HMAC verified)

POST   /api/v1/marketplace/disputes                     - File dispute
GET    /api/v1/marketplace/disputes                     - List my disputes
PATCH  /api/v1/marketplace/disputes/:id                 - Update dispute (add evidence)

# Admin routes (API key protected)
GET    /api/v1/admin/marketplace/strategies/pending     - List strategies pending vetting
POST   /api/v1/admin/marketplace/strategies/:id/vetting - Approve/reject strategy
GET    /api/v1/admin/marketplace/disputes               - List all disputes
PATCH  /api/v1/admin/marketplace/disputes/:id/resolve  - Resolve dispute with compensation
GET    /api/v1/admin/marketplace/revenue/export         - Export revenue data (CSV)
POST   /api/v1/admin/marketplace/strategies/:id/featured - Set featured strategy
```

---

## Related Code Files

### To Create
- `src/api/routes/marketplace-strategy-routes.ts`
- `src/api/routes/marketplace-subscription-routes.ts`
- `src/api/routes/marketplace-performance-routes.ts`
- `src/api/routes/marketplace-review-routes.ts`
- `src/api/routes/marketplace-revenue-routes.ts`
- `src/api/routes/marketplace-dispute-routes.ts`
- `src/api/routes/admin-marketplace-routes.ts`
- `dashboard/src/services/marketplace-api.service.ts` - Frontend API client
- `src/api/schemas/marketplace.schemas.ts` - Zod validation schemas

### To Read (Reference)
- `src/api/routes/referral-routes.ts` - Similar pattern for referral commissions
- `src/api/routes/backtest.ts` - Pagination, filtering patterns
- `src/api/routes/license-routes.ts` - Tenant-scoped queries
- `src/api/routes/coupon-routes.ts` - Admin API key auth
- `src/auth/tenant-auth-middleware.ts` - Tenant extraction from JWT/API key
- `src/middleware/rate-limiter.ts` - Rate limiting implementation

---

## Implementation Steps

### Step 1: Create Zod Schemas

Create `src/api/schemas/marketplace.schemas.ts`:

```typescript
import { z } from 'zod';

// Strategy schemas
export const publishStrategySchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().min(50).max(2000),
  category: z.enum(['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other']),
  riskLevel: z.number().min(1).max(10),
  minAllocationUsd: z.number().int().min(100).max(100000),
  maxAllocationUsd: z.number().int().min(100).max(10000000),
  supportedExchanges: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  backtestSummary: z.object({
    sharpe: z.number(),
    maxDrawdown: z.number(),
    winRate: z.number(),
    periodDays: z.number().int(),
  }).optional(),
});

export const strategyFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().optional(),
  minSharpe: z.number().optional(),
  maxDrawdown: z.number().optional(),
  sortBy: z.enum(['sharpe', 'max_drawdown', 'win_rate', 'total_pnl', 'subscriber_count', 'created_at']).default('sharpe'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// Subscription schema
export const subscribeSchema = z.object({
  listingId: z.string().min(1),
  allocationPercent: z.number().min(1).max(100),
  customRiskLimits: z.object({
    maxDailyLossPercent: z.number().optional(),
    maxPositionSizePercent: z.number().optional(),
    stopLossPercent: z.number().optional(),
    maxConcurrentTrades: z.number().int().optional(),
  }).optional(),
});

// Review schema
export const reviewSchema = z.object({
  strategyId: z.string().min(1),
  rating: z.number().min(1).max(5),
  comment: z.string().min(10).max(1000),
});

// Dispute schema
export const disputeSchema = z.object({
  listingId: z.string().min(1),
  subscriptionId: z.string().min(1),
  reason: z.enum(['performance_not_as_described', 'unauthorized_charges', 'poor_support', 'strategy_broken', 'other']),
  description: z.string().min(50).max(2000),
});

// Performance query schema
export const performanceQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  tenantSpecific: z.boolean().optional(), // for subscriber-specific performance
});
```

### Step 2: Implement Strategy Routes

Create `src/api/routes/marketplace-strategy-routes.ts`:

- `GET /marketplace/strategies` - List published strategies with filters
- `POST /marketplace/strategies/publish` - Create strategy (PRO/ENT tenants)
- `GET /marketplace/strategies/:id` - Get details including avg rating
- `PATCH /marketplace/strategies/:id` - Update (owner only, not after vetting)
- `POST /marketplace/strategies/:id/vetting/request` - Submit for vetting

### Step 3: Implement Subscription Routes

Create `src/api/routes/marketplace-subscription-routes.ts`:

- `POST /marketplace/subscriptions` - Create subscription, validate allocation against min/max
- `GET /marketplace/subscriptions` - List with status filter (active, paused, cancelled)
- `PATCH /marketplace/subscriptions/:id` - Pause/resume/update allocation
- `DELETE /marketplace/subscriptions/:id` - Cancel subscription (prorated refund?)

### Step 4: Implement Performance Routes

Create `src/api/routes/marketplace-performance-routes.ts`:

- `GET /marketplace/performance/:strategyId` - Current metrics
- `GET /marketplace/performance/:strategyId/history` - Time series for charts
- `GET /marketplace/rankings` - Top strategies by Sharpe, P&L, subscribers

### Step 5: Implement Review Routes

Create `src/api/routes/marketplace-review-routes.ts`:

- `POST /marketplace/reviews` - Only if tenant has active subscription
- `GET /marketplace/reviews/:strategyId` - Paginated list
- `DELETE /marketplace/reviews/:id` - User can delete own review
- `POST /marketplace/reviews/:id/helpful` - Vote helpful

### Step 6: Implement Revenue Routes

Create `src/api/routes/marketplace-revenue-routes.ts`:

- `GET /marketplace/revenue` - Dashboard: total revenue, payouts, subscriber stats
- `GET /marketplace/revenue/payouts` - History of Stripe payouts
- `GET /marketplace/revenue/subscribers` - List subscribers with dates
- Webhook endpoint for Stripe Connect payout completion

### Step 7: Implement Dispute Routes

Create `src/api/routes/marketplace-dispute-routes.ts`:

- `POST /marketplace/disputes` - File dispute with evidence
- `GET /marketplace/disputes` - User's disputes
- `PATCH /marketplace/disputes/:id` - Add evidence, update status
- `GET /marketplace/disputes/:id/messages` - Communication thread

### Step 8: Implement Admin Routes

Create `src/api/routes/admin-marketplace-routes.ts`:

- Admin API key protected
- `GET /admin/marketplace/strategies/pending` - Vetting queue
- `POST /admin/marketplace/strategies/:id/vetting` - Approve/reject with reason
- `GET /admin/marketplace/disputes` - All disputes with filters
- `PATCH /admin/marketplace/disputes/:id/resolve` - Resolve with compensation
- `POST /admin/marketplace/strategies/:id/featured` - Feature on homepage
- `GET /admin/marketplace/revenue/export` - CSV export for accounting

### Step 9: Frontend API Client

Create `dashboard/src/services/marketplace-api.service.ts`:

- Type-safe wrapper around fetch with all endpoints
- Error handling and retry logic
- Pagination helpers
- Request cancellation for in-flight requests

### Step 10: Register Routes

Update `src/api/server.ts` to register all new routes under `/api/v1/marketplace/*` and `/api/v1/admin/marketplace/*`.

---

## Todo List

- [ ] Create Zod schemas in `src/api/schemas/marketplace.schemas.ts`
- [ ] Implement `marketplace-strategy-routes.ts`
- [ ] Implement `marketplace-subscription-routes.ts`
- [ ] Implement `marketplace-performance-routes.ts`
- [ ] Implement `marketplace-review-routes.ts`
- [ ] Implement `marketplace-revenue-routes.ts`
- [ ] Implement `marketplace-dispute-routes.ts`
- [ ] Implement `admin-marketplace-routes.ts`
- [ ] Create frontend API client `dashboard/src/services/marketplace-api.service.ts`
- [ ] Register routes in `src/api/server.ts`
- [ ] Test all endpoints with curl/Postman
- [ ] Verify tenant isolation in queries
- [ ] Run typecheck: `pnpm run typecheck`
- [ ] Write unit tests for critical paths (see Phase 10)

---

## Success Criteria

- ✅ All 15+ endpoints implemented and documented
- ✅ All inputs validated with Zod (no unvalidated user input)
- ✅ Proper HTTP status codes on success/error
- ✅ Tenant isolation: queries always filter by tenant_id
- ✅ Admin routes require valid API key
- ✅ Pagination works on all list endpoints
- ✅ Rate limiting applied (100 req/min per tenant)
- ✅ Frontend API client ready for Phase 8 integration
- ✅ All endpoints return proper JSON with consistent error format

---

## Risks & Mitigations

**Risk**: Missing tenant filter in query leads to data leak  
**Mitigation**: Code review focus on every DB query; centralized tenant-scoped repository functions

**Risk**: Performance degradation on rankings query with 1000+ strategies  
**Mitigation**: Materialized view for rankings; cache in Redis with 5-minute TTL

**Risk**: Stripe webhook verification fails  
**Mitigation**: Use existing `stripe-webhook-middleware.ts` pattern from billing system

---

## Next Steps

After this phase:
- Phase 3 (vetting service) can start with strategy publish endpoint
- Phase 4 (copy trading) depends on subscription endpoints
- Phase 8 (frontend) can integrate API client once endpoints are ready

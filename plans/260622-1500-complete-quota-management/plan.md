# Complete Quota Management System Implementation

## Status
In Progress

## Overview
Complete the Quota Management System by integrating the core quota manager (already implemented) with the Express API server, creating user-facing and admin API routes, implementing billing integration for overages, adding comprehensive tests, and updating documentation.

## Phases

### Phase 1: Express Quota Middleware
- Create Express-compatible middleware from Fastify plugin
- Ensure proper error handling and response headers
- Add TypeScript types for Express integration

### Phase 2: API Server Integration
- Replace old `usageTrackingMiddleware` and `quotaCheckMiddleware` with new QuotaManager-based middleware
- Initialize QuotaManager on app startup
- Remove deprecated middleware files

### Phase 3: Quota Management API Routes
- User endpoint: `GET /api/v1/usage/me` - returns current usage for all quotas
- Admin endpoints: 
  - `GET /api/v1/admin/usage/:licenseKey` - detailed usage for a license
  - `POST /api/v1/admin/usage/:licenseKey/reset` - reset quotas
  - `GET /api/v1/admin/overage/invoices` - list overage invoices
- Integrate with existing revenue routes or create new admin router

### Phase 4: Billing Integration
- Extend NOWPaymentsService or create OverageBillingService
- Generate overage invoices at period boundaries (cron job)
- Update database schema for overage_invoices table (already exists)
- Add admin UI for reviewing/collecting overages

### Phase 5: Comprehensive Tests
- Unit tests for QuotaManager (mock DualLayerQuotaStore)
- Unit tests for DualLayerQuotaStore (mock Redis)
- Integration tests for Express middleware (supertest)
- End-to-end quota enforcement tests
- Ensure >90% coverage

### Phase 6: Documentation
- Update API documentation (OpenAPI spec or markdown)
- Update system-architecture.md with quota system design
- Create QUOTA_MANAGEMENT.md guide
- Update code-standards.md with quota patterns

## Dependencies
- Phase 1 → Phase 2
- Phase 2 → Phase 3
- Phase 3 → Phase 4
- Phase 4 → Phase 5
- Phase 5 → Phase 6

## Acceptance Criteria
- [ ] All Express middleware tests pass
- [ ] Quota enforcement works across all API routes
- [ ] User usage endpoint returns accurate data
- [ ] Admin usage management endpoints functional
- [ ] Overage billing generates correct invoices
- [ ] Test coverage ≥90% for quota modules
- [ ] Documentation updated and accurate
- [ ] No TypeScript or lint errors in modified files
- [ ] All CI gates pass

## File Ownership
- `src/middleware/quota-enforcement-express.ts` (new or modified)
- `src/api/server.ts` (modify)
- `src/api/routes/quota-routes.ts` (new)
- `src/billing/overage-billing-service.ts` (new or modify)
- `src/quota/__tests__/*` (new test files)
- `docs/system-architecture.md` (update)
- `docs/api-quota-endpoints.md` (new or update)

## Risks & Mitigation
- **Risk**: Fastify to Express conversion issues
  - **Mitigation**: Test thoroughly with supertest; keep compatibility layer minimal
- **Risk**: Redis failures causing quota bypass
  - **Mitigation**: Fail-open strategy already in middleware; add alerts
- **Risk**: Performance degradation from quota checks
  - **Mitigation**: Fast layer handles 99% of checks; benchmark p95 latency

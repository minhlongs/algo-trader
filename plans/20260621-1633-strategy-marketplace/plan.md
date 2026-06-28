# Strategy Marketplace Implementation Plan

**Status**: Planning Phase  
**Created**: 2025-06-21  
**Last Updated**: 2025-06-21  
**Project**: AlgoTrader RaaS Platform  
**Phase**: New Major Feature - Strategy Marketplace  

---

## Overview

Build a comprehensive strategy marketplace where:
- Strategy creators can publish vetted trading strategies
- Subscribers can copy-trade with configurable risk limits  
- Performance-based ranking and review system
- Revenue sharing model (20% to strategy creators)
- Dispute resolution process for conflicts

This marketplace transforms algo-trader from a single-tenant platform into a multi-tenant ecosystem where strategy creators monetize their expertise and users gain access to proven strategies.

---

## Phases

### Phase 1: Database Schema & Core Models
**Status**: Not Started  
**Priority**: Critical  
**Files to Create**:
- `src/marketplace/schema/marketplace-schema.sql` - Database tables
- `src/marketplace/models/strategy.model.ts` - TypeScript interfaces
- `src/db/migrations/025_marketplace_schema.sql` - Migration file

**Dependencies**: None (can run in parallel with other phases)

---

### Phase 2: Backend API Routes
**Status**: Not Started  
**Priority**: Critical  
**Files to Create**:
- `src/api/routes/marketplace-strategy-routes.ts` - Strategy CRUD & vetting
- `src/api/routes/marketplace-subscription-routes.ts` - Copy trading subscriptions
- `src/api/routes/marketplace-performance-routes.ts` - Performance & rankings
- `src/api/routes/marketplace-review-routes.ts` - User reviews
- `src/api/routes/marketplace-revenue-routes.ts` - Revenue sharing & payouts
- `src/api/routes/marketplace-dispute-routes.ts` - Dispute resolution
- `src/api/server.ts` - Register new routes

**Dependencies**: Phase 1 (needs database schema)

---

### Phase 3: Strategy Publishing & Vetting Service
**Status**: Not Started  
**Priority**: High  
**Files to Create**:
- `src/marketplace/services/strategy-publishing.service.ts` - Publish flow
- `src/marketplace/services/vetting-engine.service.ts` - Automated vetting
- `src/marketplace/services/backtest-validator.service.ts` - Backtest validation
- `src/marketplace/workers/vetting-worker.ts` - Background vetting jobs

**Dependencies**: Phase 1, Phase 2

---

### Phase 4: Copy Trading Engine with Risk Management
**Status**: Not Started  
**Priority**: Critical  
**Files to Create**:
- `src/marketplace/services/copy-trading.service.ts` - Core copy logic
- `src/marketplace/services/risk-limit-enforcer.service.ts` - Risk limit checks
- `src/marketplace/services/position-sync.service.ts` - Sync positions from creator to subscriber
- `src/marketplace/workers/position-sync-worker.ts` - Background sync

**Dependencies**: Phase 1, Phase 2

---

### Phase 5: Performance Tracking & Ranking
**Status**: Not Started  
**Priority**: High  
**Files to Create**:
- `src/marketplace/services/performance-tracker.service.ts` - Track strategy performance
- `src/marketplace/services/ranking-engine.service.ts` - Compute rankings
- `src/marketplace/services/review-service.ts` - Handle reviews & ratings
- `src/marketplace/workers/performance-calc-worker.ts` - Daily performance calc

**Dependencies**: Phase 1, Phase 2, Phase 4

---

### Phase 6: Revenue Sharing & Payment Integration
**Status**: Not Started  
**Priority**: High  
**Files to Create**:
- `src/marketplace/services/revenue-sharing.service.ts` - Revenue calc (20% to creator)
- `src/marketplace/services/payout-service.ts` - Payout orchestration
- `src/marketplace/integrations/stripe-adapter.ts` - Stripe Connect integration
- `src/marketplace/workers/revenue-distribution-worker.ts` - Daily distribution

**Dependencies**: Phase 1, Phase 2, Phase 5

---

### Phase 7: Dispute Resolution System
**Status**: Not Started  
**Priority**: Medium  
**Files to Create**:
- `src/marketplace/services/dispute-resolution.service.ts` - Handle disputes
- `src/marketplace/models/dispute.model.ts` - Dispute data model
- `src/api/routes/marketplace-admin-routes.ts` - Admin dispute resolution
- `src/marketplace/notifications/dispute-notifier.ts` - Notify parties

**Dependencies**: Phase 1, Phase 2

---

### Phase 8: Frontend Dashboard Pages
**Status**: Not Started  
**Priority**: High  
**Files to Modify/Create**:
- `dashboard/src/pages/marketplace-strategy-list-page.tsx` - Browse strategies
- `dashboard/src/pages/marketplace-strategy-detail-page.tsx` - Strategy details & subscribe
- `dashboard/src/pages/marketplace-subscriptions-page.tsx` - User's subscriptions
- `dashboard/src/pages/marketplace-creator-dashboard-page.tsx` - Creator analytics
- `dashboard/src/pages/marketplace-revenue-page.tsx` - Revenue & payouts
- `dashboard/src/components/marketplace/` - New component library
- `dashboard/src/stores/marketplace-store.ts` - Zustand store

**Dependencies**: Phase 2 (API routes)

---

### Phase 9: Admin Dashboard & Moderation
**Status**: Not Started  
**Priority**: Medium  
**Files to Create**:
- `dashboard/src/pages/admin/marketplace-admin-page.tsx` - Admin moderation
- `src/api/routes/admin-marketplace-routes.ts` - Admin APIs
- `src/marketplace/services/moderation.service.ts` - Content moderation

**Dependencies**: Phase 1, Phase 2, Phase 3

---

### Phase 10: Testing & Integration
**Status**: Not Started  
**Priority**: Critical  
**Files to Create**:
- `src/marketplace/__tests__/strategy-publishing.test.ts`
- `src/marketplace/__tests__/copy-trading.test.ts`
- `src/marketplace/__tests__/revenue-sharing.test.ts`
- `src/marketplace/__tests__/dispute-resolution.test.ts`
- `tests/integration/marketplace.integration.test.ts`
- Update existing test suites

**Dependencies**: All phases

---

### Phase 11: Documentation & Deployment
**Status**: Not Started  
**Priority**: Medium  
**Files to Create/Update**:
- `docs/marketplace-architecture.md` - System design
- `docs/marketplace-api.md` - API documentation
- `docs/marketplace-ops.md` - Operational runbook
- Update `docs/system-architecture.md` with marketplace components
- `docs/project-roadmap.md` - Update roadmap

**Dependencies**: Phase 10

---

## Success Criteria

### Functional Requirements
- ✅ Strategy creators can publish strategies after automated vetting + admin approval
- ✅ Subscribers can browse, review, and subscribe to strategies
- ✅ Copy trading executes with real-time position synchronization
- ✅ Risk limits enforced automatically (max allocation, stop-loss, drawdown caps)
- ✅ Performance metrics calculated daily (Sharpe, max drawdown, win rate, total P&L)
- ✅ Rankings computed with configurable time windows (7d, 30d, 90d, all-time)
- ✅ Reviews and ratings displayed with anti-fraud validation
- ✅ Revenue sharing automatically distributes 20% to creators via Stripe Connect
- ✅ Dispute resolution workflow with admin arbitration
- ✅ Creator dashboard shows earnings, subscriber count, performance charts

### Non-Functional Requirements
- ✅ All database queries indexed for performance
- ✅ Rate limiting on marketplace APIs (100 req/min per tenant)
- ✅ Tenant isolation enforced (no cross-tenant data leaks)
- ✅ All external payments secured with HMAC verification
- ✅ Audit logging for all revenue and dispute actions
- ✅ 0 TypeScript errors, 100% test coverage on critical paths
- ✅ API response times p95 < 100ms for read operations

---

## Risk Assessment

### High Risk
1. **Payment Integration Complexity**: Stripe Connect requires legal entity verification for creators. Mitigation: Start with manual payout approval before full automation.
2. **Copy Trading Latency**: Real-time sync may lag during high volatility. Mitigation: Implement queue-based async processing with position reconciliation.
3. **Revenue Calculation Accuracy**: Must handle partial fills, fees, and multi-exchange positions correctly. Mitigation: Extensive backtesting with historical trade data.

### Medium Risk
1. **Vetting Evasion**: Bad actors may try to game the vetting system. Mitigation: Multi-layer validation (backtest + paper trading + admin review).
2. **Review Fraud**: Fake reviews could distort rankings. Mitigation: Only verified subscribers can review; anomaly detection on review patterns.
3. **Dispute Volume**: High dispute rate could strain operations. Mitigation: Clear TOS, automated fraud detection, 48-hour SLA for responses.

### Low Risk
1. **Scalability**: Marketplace queries may slow with 1000+ strategies. Mitigation: Materialized views for rankings, Redis caching layer.
2. **Dashboard Complexity**: Frontend state management could become unwieldy. Mitigation: Use Zustand stores, modular components.

---

## Security Considerations

- **Authorization**: Only premium tenants (PRO/ENTERPRISE) can publish or subscribe
- **Revenue Payouts**: Require creator KYC verification before first payout
- **Data Isolation**: Multi-tenant isolation via tenantId on all tables
- **Audit Trail**: All revenue, subscription, and dispute actions logged
- **Rate Limiting**: Marketplace-specific rate limits separate from core trading APIs
- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection**: Parameterized queries only via Prisma/driver

---

## File Ownership & Parallelization

**This plan's file ownership**: `plans/20260621-1633-strategy-marketplace/*`  
**Source files to modify**: Existing codebase in `src/`, `dashboard/`, `prisma/` (if exists), `src/db/`

**Parallel execution possible**:
- Phase 1 (DB schema) can run concurrently with Phase 8 (frontend components)
- Phase 2 (API routes) can run concurrently with Phase 3 (vetting service)  
- Phase 4 (copy trading) should run sequentially after Phase 2
- Phase 5 (performance) and Phase 6 (revenue) can run in parallel after Phase 4
- Phase 7 (disputes) can run independently after Phase 2

**No file conflicts expected** if each phase uses distinct directories under `src/marketplace/` and `dashboard/src/pages/marketplace-*`.

---

## Related Work

- **Existing Referral System**: `src/referral/` - Similar commission tracking pattern
- **Billing System**: `src/billing/` - Stripe integration, usage quotas
- **Whale Copy-Trading**: Phase 28 mentioned in architecture (basic copy trading exists)
- **Strategy Loader**: `src/strategies/loader.ts` - Understanding strategy deployment patterns

---

## Acceptance Testing

1. **End-to-End Flow**: Publish strategy → pass vetting → user subscribes → copy trading executes → revenue distributed
2. **Load Test**: 100 concurrent subscriptions, 1000 strategies in marketplace, 10k daily performance calculations
3. **Security Audit**: Verify tenant isolation, payment security, KYC enforcement
4. **Dispute Drill**: File dispute → admin resolves → payout adjusted

---

## Rollback Plan

- **Database**: Each migration is reversible with `DOWN` scripts
- **Feature Flags**: Use existing `raas-gate` system to disable marketplace per-tenant
- **Payout Halt**: Admin kill switch to stop revenue distribution (`/api/admin/marketplace/payouts/halt`)
- **Monitoring**: Grafana dashboard for marketplace health (subscriptions, revenue, disputes)

---

## Next Steps

1. Get plan approval from user
2. Execute Phase 1 (DB schema) - 2 days
3. Execute Phase 2 (API routes) - 3 days (parallel with Phase 8)
4. Execute Phase 3 (vetting service) - 2 days
5. Execute Phase 4 (copy trading) - 4 days (critical path)
6. Continue through all phases with tester + reviewer subagents

Total estimated: 3-4 weeks for complete implementation.

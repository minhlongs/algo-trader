# Strategy Marketplace: Complete Design Package

**Plan**: `260621-1649-strategy-marketplace-implementation`  
**Design Completed**: 2026-06-21  
**Total Phases**: 6 (all designed)  
**Target Implementation**: ~13 development days

## Package Contents

```
plans/260621-1649-strategy-marketplace-implementation/
├── plan.md                                          # Master plan (requirements, architecture, metrics)
├── phase-01-service-layer-foundation.md             # Repository + MarketplaceService
├── phase-02-vetting-admin-workflows.md             # VettingService + admin routes
├── phase-03-subscription-copy-trading.md           # SubscriptionService + risk limits
├── phase-04-performance-ranking-reviews.md         # PerformanceService + ReviewService
├── phase-05-revenue-sharing-payouts.md             # RevenueService + Stripe Connect
└── phase-06-dispute-resolution-integration.md     # DisputeService + final E2E
```

## Design Summary

### Phase 1: Service Layer Foundation
**Deliverables**: 7 repository classes, MarketplaceService, DTOs  
**Files to Create**: 10 files in `src/marketplace/`  
**Tests**: Unit + integration (≥80% coverage)  
**Rollback**: Feature flag `MARKETPLACE_ENABLED`

### Phase 2: Vetting & Admin Workflows
**Deliverables**: VettingService, admin routes, notification templates, BullMQ worker  
**Files to Create**: 5 files  
**Metrics**: `marketplace_vetting_queue_size`, `vetting_decisions_total`  
**SLA**: 48-hour turnaround, auto-escalation after 48h

### Phase 3: Subscription & Copy Trading
**Deliverables**: SubscriptionService, RiskLimitService, risk middleware, subscription routes  
**Files to Create**: 6 files (including middleware)  
**Integration**: Billing service, strategy execution pipeline  
**Risk Limits**: daily loss, position size, max concurrent trades, stop-loss

### Phase 4: Performance Ranking & Reviews
**Deliverables**: PerformanceService, ReviewService, daily aggregation worker, ranking routes, Redis caching  
**Files to Create**: 6 files  
**Metrics**: Sharpe, win rate, max drawdown, profit factor (30d rolling)  
**Cache**: 5-minute TTL on rankings

### Phase 5: Revenue Sharing & Payouts
**Deliverables**: RevenueService, Stripe payout integration, creator dashboard, monthly aggregation  
**Files to Create**: 4 files  
**Revenue Split**: 80% platform, 20% creator  
**Minimum Payout**: $50, Stripe Connect  
**Cron**: Monthly (1st 00:00 UTC)

### Phase 6: Dispute Resolution & Final Integration
**Deliverables**: DisputeService, dispute routes, escalation worker, compensation logic, E2E tests, docs  
**Files to Create**: 5 files  
**Dispute Reasons**: performance_not_as_described, unauthorized_charges, poor_support, strategy_broken, other  
**Compensation**: full_refund, partial_refund, credit, none  
**SLA**: 5-day resolution, auto-escalate at 7 days

## Architecture Consistency

- **Layer boundaries**: Respects existing `src/api/`, `src/services/` (as `services/`), `src/repositories/`
- **File size**: All files target ≤200 LOC, decomposed by concern
- **Naming**: Kebab-case, descriptive filenames
- **Validation**: Zod schemas throughout (existing patterns)
- **Auth**: Tenant-scoped for user routes, `X-Admin-Key` for admin routes
- **Audit**: All mutations logged via AuditLogService
- **Observability**: Prometheus metrics for every critical path
- **Security**: Tenant isolation, input validation, rate limiting, Stripe webhook signatures

## Database Schema (Migration 025)

All 7 tables already defined:
- `marketplace_strategies`
- `marketplace_listings`
- `marketplace_subscriptions`
- `marketplace_performance`
- `marketplace_reviews`
- `marketplace_revenue_shares`
- `marketplace_disputes`

Indexes: All defined in migration, verify applied.

## Testing Strategy (Total ≥100 New Tests)

| Phase | Unit | Integration | E2E | Total |
|-------|------|-------------|-----|-------|
| 1 | 70 | 10 | 0 | 80 |
| 2 | 30 | 10 | 0 | 40 |
| 3 | 40 | 15 | 0 | 55 |
| 4 | 50 | 15 | 10 | 75 |
| 5 | 30 | 10 | 0 | 40 |
| 6 | 40 | 20 | 20 | 80 |
| **Total** | **260** | **80** | **30** | **370+** |

Plus existing 868 tests → **1238+ total** after completion.

## Rollback Hierarchy Integration

| Tier | Marketplace Scope | Mechanism |
|------|-------------------|-----------|
| L1 Kill Switch | Entire marketplace disabled | `MARKETPLACE_ENABLED=false` → routes return 503 |
| L2 Swarm Flag | Feature flag toggle | In-memory `isMarketplaceEnabled()` |
| L3 Drawdown | N/A (non-trading) | Individual service degradation (billing, aggregation) |
| L4 Paper Gate | N/A | No gating needed |

**Critical Failures**:
- Revenue calc error → L1 disable payouts, manual reconciliation
- Dispute spam → L2 rate-limit, L3 manual review queue
- Performance ranking slow → L3 increase Redis TTL

## Security Checklist

- [x] Tenant isolation enforced in all repository queries
- [x] Admin routes protected by `X-Admin-Key` middleware
- [x] All API inputs validated with Zod schemas
- [x] SQL injection prevention via Prisma ORM
- [x] Revenue records immutable once `status='paid'`
- [x] Dispute evidence URL validation (HTTPS only)
- [x] Rate limiting per-tenant (existing middleware)
- [x] Stripe webhooks verified (HMAC-SHA256)
- [x] Audit logging for all mutations
- [x] Risk limit enforcement in trade execution (cannot bypass)

## Performance Targets

| Endpoint | Target p95 | DB Query | Cache |
|----------|-----------|----------|-------|
| `GET /marketplace/strategies` (list) | 100ms | Indexed filter/status | No |
| `GET /marketplace/rankings` | 200ms | Complex JOIN | Yes (5min TTL) |
| `POST /marketplace/subscriptions` | 150ms | Transaction (3 tables) | No |
| `GET /marketplace/strategy/:id` | 80ms | PK lookup + JOINs | Yes (1min) |
| `GET /admin/marketplace/strategies/pending` | 200ms | Indexed status query | No |

## Metrics & Alerting (Prometheus)

**New Gauges**:
- `marketplace_strategies_total{status}`
- `marketplace_subscriptions_active{listing_id}`
- `marketplace_vetting_queue_size`
- `marketplace_disputes_open{reason}`
- `marketplace_pending_payouts_cents`

**New Counters**:
- `marketplace_revenue_total_cents`
- `marketplace_creator_payouts_total_cents`
- `marketplace_risk_limit_breaches_total{limit_type}`
- `marketplace_vetting_decisions_total{decision}`
- `marketplace_reviews_created_total{rating}`

**New Histograms**:
- `marketplace_ranking_query_duration_seconds`
- `marketplace_performance_aggregation_duration`
- `marketplace_dispute_resolution_time_seconds`

**Grafana Dashboard**: `marketplace-overview.json` (to be created in Phase 6)

## Unresolved Questions (Post-Design)

1. **Strategy code artifact storage**: External S3/R2 or DB? → **Decision needed before implementation**
2. **Creator payout frequency**: Monthly as designed, but threshold? → **$50 minimum proposed**
3. **Strategy versioning**: Auto-update or pinned? → **Pinned, manual upgrade**
4. **Review helpful voting**: Per-tenant tracking? → **Enhancement for Phase 7**
5. **Performance aggregation**: Real-time vs batch? → **Batch (02:00 UTC) with 5min cache**

These are minor decisions that can be made during implementation without major architecture changes.

## Implementation Order (Dependency Graph)

```
Phase 1 (service layer)
    ↓
Phase 2 (vetting) ──┐
    ↓              │
Phase 3 (subscriptions) ←─ Parallel possible?
    ↓              │
Phase 4 (performance/reviews) ←─ Phase 2 (need approved strategies)
    ↓              │
Phase 5 (revenue) ←─ Phase 3 (need subscriptions)
    ↓              │
Phase 6 (disputes) ←─ Phase 3 (subscriptions), Phase 5 (revenue)
```

**Optimal parallelization**:
- Week 1: Phase 1 (foundation)
- Week 2: Phase 2 + Phase 3 (start together after Phase 1)
- Week 3: Phase 4 (after Phase 2) + Phase 5 (after Phase 3)
- Week 4: Phase 6 (final integration)

**Wall-clock**: 4 weeks with 2-3 parallel devs.

## Handoff to Implementation (CLAUDE.code.md)

Developer agent will:

1. **Phase 1**: Create all repository classes, MarketplaceService, register routes in `index.ts`
2. **Phase 2**: Implement VettingService, admin routes, notifications, worker
3. **Phase 3**: Implement SubscriptionService, RiskLimitService, middleware, integrate with billing
4. **Phase 4**: Implement PerformanceService, ReviewService, aggregation worker, ranking routes
5. **Phase 5**: Implement RevenueService, Stripe payouts, creator dashboard routes
6. **Phase 6**: Implement DisputeService, compensation logic, E2E tests, documentation

Each phase:
- Read this design file first
- Create listed files exactly as specified
- Follow `docs/code-standards.md` (TypeScript strict, ≤200 LOC, kebab-case)
- Write tests before code (TDD)
- Run `pnpm run typecheck` and `pnpm test` after each phase
- Update `docs/` at end of Phase 6
- Code review ≥9.0/10 before marking complete

---

**Design Phase Complete** ✅

All design artifacts ready for implementation per CLAUDE.design.md specification.

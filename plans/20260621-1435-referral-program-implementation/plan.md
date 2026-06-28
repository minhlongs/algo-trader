# Referral Program Implementation Plan

**Status**: In Progress  
**Created**: 2025-06-21  
**Owner**: Engineering Factory  
**Priority**: P1 - Business Critical  

---

## Overview

Implement a comprehensive referral program to drive organic growth:

- **Unique referral codes**: One per tenant (auto-generated from subscriber_id)
- **Commission tracking**: 10% of referred tenant fees for 12 months
- **Payout automation**: Monthly payout processing with Stripe integration
- **Dashboard**: Real-time metrics (clicks, conversions, revenue)
- **Anti-fraud**: IP validation, rate limiting, pattern detection

---

## Phases

### Phase 1: Database Schema & Core Models
**Files**: `src/db/migrations/103_*`, `src/db/schema.sql` updates  
**Status**: Pending

- Create `referral_codes` table
- Create `referral_tracking` table  
- Create `referral_commissions` table
- Add `referral_code` column to `tenant_credentials`
- Migration scripts with data backfill

### Phase 2: Referral Service Layer
**Files**: `src/referral/` (new directory)  
**Status**: Pending

- `referral-service.ts` - core logic
- `commission-calculator.ts` - 10% fee calculation
- `payout-scheduler.ts` - monthly batch processing
- `fraud-detector.ts` - anti-fraud patterns
- Types and interfaces

### Phase 3: API Endpoints
**Files**: `src/api/routes/referral-routes.ts` (new)  
**Status**: Pending

- `GET /api/v1/referral/stats` - dashboard metrics
- `GET /api/v1/referral/code` - get tenant's referral code
- `POST /api/v1/referral/track-click` - track referral link click
- `GET /api/v1/referral/commissions` - list earned commissions
- `GET /api/v1/referral/payouts` - payout history
- `POST /api/v1/referral/generate-code` - admin: generate code
- Middleware: `referral-auth.ts` - validate referral params

### Phase 4: Dashboard UI
**Files**: `dashboard/src/pages/referral-page.tsx` (new), components  
**Status**: Pending

- Referral dashboard page
- Stats cards: total clicks, conversions, earned, pending
- Commission chart (time series)
- Payout history table
- Referral link generator with copy button
- Top referrers widget

### Phase 5: Payout Automation
**Files**: `src/jobs/referral-payout-job.ts` (new)  
**Status**: Pending

- BullMQ monthly job
- Commission aggregation
- Stripe transfer integration
- Payout notification emails
- Admin payout review UI

### Phase 6: Anti-Fraud System
**Files**: `src/referral/fraud-detector.ts` (enhance)  
**Status**: Pending

- IP rate limiting (max 10 clicks/hour/IP)
- Same-IP conversion detection
- Device fingerprinting via cookies
- Suspicious pattern alerts
- Fraud score threshold (auto-block > 80)

### Phase 7: Testing & Monitoring
**Files**: `src/referral/__tests__/`, `src/api/routes/__tests__/`  
**Status**: Pending

- Unit tests: 90% coverage
- Integration: click → signup → commission flow
- E2E: referral dashboard
- Metrics: `referral_clicks_total`, `referral_conversions_total`

### Phase 8: Documentation
**Files**: `docs/referral-program.md`, `docs/api-reference.md`  
**Status**: Pending

- Feature documentation
- API reference
- Admin runbook
- Dashboard user guide

---

## Dependencies

- Billing DB schema complete (Phase 1)
- Tenant authentication working (Phase 3)
- Dashboard routing configured (Phase 4)
- Stripe integration stable (Phase 5)
- BullMQ job queue operational (Phase 5)

---

## Success Criteria

- [ ] Unique referral codes generated for 100% of tenants
- [ ] Commission tracking accuracy: 100% of eligible fees captured
- [ ] Payout automation: monthly job succeeds with < 0.1% error rate
- [ ] Dashboard loads in < 2s with 10k+ referral records
- [ ] Fraud detection blocks > 95% of simulated attacks
- [ ] Test coverage ≥ 90%
- [ ] Zero production incidents during rollout

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fraudulent signups drain revenue | High | Multi-layer fraud detection, manual review queue |
| Commission miscalculations | High | Double-entry accounting, audit trail, reconciliation reports |
| Payout failures | Medium | Retry logic, alerting, manual override |
| Dashboard performance | Medium | Indexed queries, pagination, caching layer |
| Privacy (PII in logs) | High | Data masking, GDPR compliance, retention policies |

---

## Rollout Strategy

1. **Week 1-2**: Phases 1-2 (backend core)
2. **Week 3**: Phase 3 (API) + internal testing
3. **Week 4**: Phase 4 (dashboard) + QA
4. **Week 5**: Phase 5 (payouts) + staging validation
5. **Week 6**: Phase 6 (fraud) + security review
6. **Week 7**: Phase 7 (testing) + UAT
7. **Week 8**: Phase 8 (docs) + production rollout

---

## Acceptance Criteria

### Phase 1
- Migration applies cleanly to staging DB
- Existing tenant data unaffected
- New columns nullable for backward compatibility

### Phase 2
- `ReferralService.generateCode(tenantId)` returns valid code
- `CommissionCalculator.calculate(tenantId, period)` returns accurate amount
- `FraudDetector.assessRisk(clickData)` returns score 0-100

### Phase 3
- All endpoints return correct HTTP status codes
- Zod validation rejects invalid inputs
- Auth middleware blocks unauthorized access

### Phase 4
- Dashboard displays accurate real-time data
- Charts render without errors
- Mobile responsive (viewport 375px-1920px)

### Phase 5
- Monthly job executes successfully (cron: `0 0 1 * *`)
- Stripe transfers complete with correct amounts
- Email notifications sent to tenants

### Phase 6
- Rate limiter blocks excessive clicks
- Fraud score correctly identifies test attack patterns
- Admin alerts triggered on suspicious activity

---

## File Ownership

**Backend Team**:
- `src/db/migrations/103_*`
- `src/referral/`
- `src/api/routes/referral-routes.ts`
- `src/jobs/referral-payout-job.ts`
- `src/features/referral/` (optional feature flag wrapper)

**Frontend Team**:
- `dashboard/src/pages/referral-page.tsx`
- `dashboard/src/components/referral/`
- `dashboard/src/stores/referral-store.ts`

**DevOps**:
- Cron job configuration
- Stripe webhook setup
- Monitoring dashboards (Grafana)

---

## Next Steps

1. ✅ Create plan file
2. Start Phase 1: database migration design
3. Run `pnpm run typecheck` to ensure baseline quality
4. Create feature flag: `ENABLE_REFERRAL_PROGRAM`

---

**Plan Version**: 1.0  
**Last Updated**: 2025-06-21  
**Related**: Billing System (Phase 1-2 complete), Multi-Tenant Architecture

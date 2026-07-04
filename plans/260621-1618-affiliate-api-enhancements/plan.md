# Affiliate API Enhancement Plan

**Status**: In Progress  
**Created**: 2025-06-21  
**Owner**: Engineering Factory  
**Priority**: P1 - Business Critical  
**Builds On**: Existing Referral System (migration 024, service layer, API routes)

---

## Overview

Extend the existing referral system into a full-featured Affiliate API with:
- **Cookie-based attribution** (90-day window) - currently only URL param tracking
- **Real-time commission tracking** - WebSocket/SSE for live updates to partners
- **Enhanced reporting API** - date ranges, exports (CSV/JSON), advanced metrics
- **Dedicated affiliate auth** - separate API key tier for partner access
- **Improved fraud detection** - device fingerprinting, proxy detection

The existing referral infrastructure (database, service, routes, dashboard) is ~80% complete. This plan adds the missing 20% to deliver a production-grade affiliate partner experience.

---

## Current State Assessment

### ✅ Already Implemented
- Database: `referral_codes`, `referral_tracking`, `referral_commissions`
- Service layer: `ReferralService`, `FraudDetector`, `CommissionCalculator`
- API endpoints: stats, code management, track-click, commissions, payouts, validation
- Dashboard: Referral page with metrics
- Payout scheduler: Monthly commission aggregation
- Basic fraud detection: IP/User-Agent rate limiting

### ❌ Missing Features (This Plan)
1. **Cookie-based attribution** - 90-day persistent attribution window
2. **Real-time updates** - WebSocket channel for commission events
3. **Advanced reporting** - date filters, exports, time-series aggregations
4. **Affiliate-specific auth** - API key tier with limited scope
5. **Enhanced fraud** - device fingerprint, proxy/VPN detection, behavioral signals

---

## Phases

### Phase 1: Cookie-Based Attribution System
**Files**: `src/referral/cookie-attribution.ts`, `src/api/middleware/affiliate-cookie.ts`, DB migration  
**Status**: Not Started  
**Effort**: 2 days

- Add `affiliate_cookie` table to track cookie mappings (hash → referral code)
- Create `CookieAttributionService`:
  - Set cookie on click (`Set-Cookie: affiliate=hash; Max-Age=7776000; Path=/`)
  - Read cookie on signup/activation
  - Fallback to URL param if cookie absent
  - 90-day TTL enforcement
  - Cookie hashing for PII protection
- Update `track-click` endpoint to set cookie
- Update signup flow (`onboarding-routes.ts`) to read cookie and attribute
- Migration: backfill existing clicks without cookies

**Success Criteria**:
- Cookie set on 100% of referral link clicks
- 90-day attribution window enforced
- Zero regression in existing conversion tracking

---

### Phase 2: Real-Time Commission Tracking
**Files**: `src/referral/real-time-commission-publisher.ts`, `src/referral/commission-websocket-handler.ts`, dashboard store updates  
**Status**: Not Started  
**Effort**: 1.5 days

- Publish commission events to Redis:
  - `commission.created`
  - `commission.updated` (status changes: pending → approved → paid)
- Add WebSocket channel `affiliate_commissions` to `RedisWSAdapter`
- Create `CommissionWebSocketHandler`:
  - Authenticate affiliate via API key
  - Subscribe to commissions for their tenant_id
  - Broadcast real-time updates
- Update dashboard `referral-store.ts` to listen on WebSocket
- Add metrics: `affiliate_ws_connections`, `commission_events_published`

**Success Criteria**:
- Commissions appear in dashboard within 2 seconds of creation
- WebSocket connection stable with auto-reconnect
- < 100ms latency for event propagation

---

### Phase 3: Enhanced Reporting API
**Files**: `src/api/routes/referral-reports-routes.ts`, `src/referral/reporting-service.ts`, export generators  
**Status**: Not Started  
**Effort**: 2 days

- New endpoints under `/api/v1/referral/reports`:
  - `GET /conversions?start=2025-06-01&end=2025-06-30` - date-filtered conversions
  - `GET /earnings?granularity=day|week|month` - time-series aggregation
  - `GET /export/csv?type=commissions&start=...&end=...` - CSV export
  - `GET /export/json?type=clicks&...` - JSON export
  - `GET /performance?metric=epc|conversion_rate` - EPC (earnings per click), trends
  - `GET /geographic` - country/region breakdown (from IP geolocation)
  - `GET /devices` - device type, browser breakdown
- Add date range validation (max 1 year)
- Stream CSV exports for large datasets (cursor-based)
- Cache frequent reports in Redis (5-min TTL)

**Success Criteria**:
- Date queries execute < 500ms for 100k+ records
- CSV export handles 10k+ rows without OOM
- All endpoints authenticated and rate-limited

---

### Phase 4: Dedicated Affiliate Authentication
**Files**: `src/billing/affiliate-api-key-manager.ts`, `src/api/middleware/affiliate-auth.ts`, DB migration  
**Status**: Not Started  
**Effort**: 1.5 days

- Add `affiliate_api_keys` table:
  - Separate from tenant API keys
  - Limited scope: only referral endpoints
  - Rate limits: 1000 RPM (higher than regular tenants)
  - Can be revoked without affecting tenant access
- `AffiliateApiKeyManager`:
  - Generate/rotate/revoke affiliate keys
  - Validate keys (HMAC-SHA256 signature)
  - Track usage per key
- Middleware `affiliateAuthMiddleware`:
  - Check `X-Affiliate-API-Key` header
  - Set `req.affiliate.tenantId` and `req.affiliate.isAffiliate = true`
  - Reject if key invalid or revoked
- Dashboard: Affiliate key management UI (separate section)
- Migration: auto-generate affiliate keys for existing tenants with >10 conversions

**Success Criteria**:
- Affiliate keys work only on `/api/v1/referral/*` endpoints
- Revocation takes effect immediately (< 1 second)
- Separate rate limiting from tenant API keys

---

### Phase 5: Enhanced Fraud Detection
**Files**: `src/referral/fraud-detector-v2.ts`, `src/referral/device-fingerprint.ts`, `src/referral/proxy-detector.ts`  
**Status**: Not Started  
**Effort**: 2 days

**New fraud signals**:
1. **Device fingerprinting**:
   - Hash (User-Agent + Accept-Language + Screen resolution if available)
   - Track same device across multiple clicks
   - Flag if >5 different IPs per device per day
2. **Proxy/VPN detection**:
   - Integrate with ipqualityscore.com or local IP2Location DB
   - Block datacenter IPs (AWS, GCP, Azure ranges)
   - Flag residential proxy services (Luminati, BrightData)
3. **Click-to-signup timing**:
   - Instant signup (< 5 seconds) = high bot probability
   - Average legitimate time: 2-10 minutes
4. **Email domain analysis**:
   - Disposable email domains (mailinator, temp-mail)
   - Typo-squatting domains (gmial.com)
5. **Geolocation mismatch**:
   - IP country ≠ browser language ≠ timezone
   - Impossible travel ( clicks from NY and London within 1 hour)
6. **Aggressive self-referral detection**:
   - Same IP as referring tenant's API calls
   - Same device fingerprint as referring tenant's login

**Implementation**:
- Update `FraudDetector` to add new scores (weighted sum)
- Store detailed fraud breakdown in `referral_tracking.metadata.fraud_details`
- Block clicks with score > 80 automatically
- Create admin fraud review dashboard
- Add nightly batch job to re-analyze past 30 days with new models

**Success Criteria**:
- Block > 95% of simulated bot attacks
- False positive rate < 2% on legitimate traffic
- Fraud score correlates with actual chargeback rates

---

### Phase 6: Testing & Monitoring
**Files**: Tests across all new modules, Prometheus metrics, Grafana dashboard  
**Status**: Not Started  
**Effort**: 1 day

**Unit Tests** (≥90% coverage):
- Cookie attribution: set/read/expire scenarios
- Real-time publisher: event serialization, Redis errors
- Reporting: date filters, aggregations, edge cases
- Affiliate auth: key validation, scope enforcement
- Fraud detection: all new signals

**Integration Tests**:
- Full flow: click → cookie → signup (90d window) → commission → WS push
- Date range queries with large datasets
- CSV export streaming
- Auth bypass attempts

**Load Tests**:
- 1000 RPS `track-click` with cookie set
- 500 concurrent WebSocket connections
- 100 RPS reporting queries with 1M rows

**Metrics**:
- `affiliate_cookies_set_total`
- `affiliate_attributions_total` (by window: <1d, <7d, <30d, <90d)
- `commission_ws_messages_total`
- `report_exports_total` (by format)
- `affiliate_auth_failures_total`
- `fraud_detection_score_bucket`

**Grafana Dashboard**:
- Attribution conversion funnel
- Real-time commission velocity
- Fraud score distribution
- Affiliate key usage

**Success Criteria**:
- All tests passing
- Metrics exported correctly
- Dashboard operational

---

### Phase 7: Documentation & Deployment
**Files**: API docs, admin runbook, migration guide, dashboard user guide  
**Status**: Not Started  
**Effort**: 0.5 days

- Update `docs/api-reference.md` with all new endpoints
- Write `docs/affiliate-program.md` (partner-facing)
- Create `docs/runbooks/affiliate-fraud-review.md`
- Add migration steps to `README.md`
- Update dashboard with affiliate key management section

---

## Dependencies

- **Phase 1**: Existing `referral_tracking` table (migration 024)
- **Phase 2**: `RedisWSAdapter` already exists (can add new channel)
- **Phase 3**: Existing reporting queries in `ReferralRepository`
- **Phase 4**: Existing `tenant_credentials` table, API key patterns
- **Phase 5**: Existing `FraudDetector` infrastructure
- All phases: PostgreSQL, Redis, BullMQ (already deployed)

---

## File Ownership (Exclusive to This Plan)

**Backend**:
- `src/referral/cookie-attribution.ts`
- `src/referral/real-time-commission-publisher.ts`
- `src/referral/commission-websocket-handler.ts`
- `src/referral/reporting-service.ts`
- `src/billing/affiliate-api-key-manager.ts`
- `src/referral/fraud-detector-v2.ts`
- `src/referral/device-fingerprint.ts`
- `src/referral/proxy-detector.ts`
- `src/api/routes/referral-reports-routes.ts`
- `src/api/middleware/affiliate-auth.ts`
- `src/api/middleware/affiliate-cookie.ts`
- `src/db/migrations/025_*`, `026_*`, `027_*` (as needed)
- `src/referral/__tests__/`, `src/api/routes/__tests__/`

**Frontend**:
- `dashboard/src/stores/affiliate-store.ts`
- `dashboard/src/pages/affiliate-reports-page.tsx`
- `dashboard/src/components/affiliate/affiliate-key-management.tsx`
- `dashboard/src/components/affiliate/real-time-commissions-widget.tsx`

**DevOps**:
- `docker/grafana/dashboards/affiliate-program.json`
- `scripts/affiliate-fraud-review.ts` (admin tool)

---

## Testing Strategy

1. **Unit**: Mock Redis, Postgres; test all business logic in isolation
2. **Integration**: Spin up test DB + Redis; test full flow (click → cookie → signup → commission)
3. **E2E**: Playwright tests for affiliate dashboard, real-time updates
4. **Load**: k6 scripts for track-click, WebSocket, reporting endpoints
5. **Security**: Auth bypass attempts, SQL injection, XSS in metadata

---

## Security Considerations

- **Cookie security**: `HttpOnly`, `Secure`, `SameSite=Lax` (affiliate links cross-site)
- **API key hashing**: Store HMAC-SHA256, never plaintext
- **Rate limiting**: Separate limiter for affiliate endpoints (1000 RPM per key)
- **Data isolation**: Enforce `tenantId` filter on all queries
- **Export limits**: Max 1 year data per request, require re-auth for >100k rows
- **PII masking**: Never expose referring tenant's email/name in reports

---

## Rollback Plan

- **Cookie attribution**: Toggle `ENABLE_COOKIE_ATTRIBUTION` feature flag; fallback to URL param
- **Real-time WS**: Remove `affiliate_commissions` channel subscription; no push
- **Enhanced fraud**: Run in parallel mode (score only, don't block) for 30 days; monitor false positives
- **New API routes**: Use `express-promise-router` with try-catch; route removal doesn't affect existing endpoints

---

## Success Criteria

- [ ] Cookie attribution captures >90% of conversions with 90d window
- [ ] WebSocket commission updates delivered < 2s latency
- [ ] Reporting API handles 1M+ rows with < 1s p95
- [ ] Affiliate API keys functional and isolated
- [ ] Fraud detection blocks >95% of simulated attacks, <2% false positive
- [ ] All tests passing: unit ≥90%, integration 100%, E2E 100%
- [ ] Zero security incidents in first 30 days
- [ ] Partner satisfaction: NPS ≥ 50 (survey 10+ pilot partners)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cookie attribution breaks existing URL param flow | High | Dual-write: support both cookie + param for 90-day transition |
| WebSocket scaling issues (10k+ connections) | Medium | Use Redis adapter (already built), connection pooling, horizontal scaling |
| Export endpoints OOM on large datasets | Medium | Stream CSV via `fastify/csv`, pagination, cursor-based |
| Fraud false positives block legitimate partners | High | Gradual rollout: start with score-only mode, manual review queue |
| Affiliate keys leaked | Critical | Auto-rotation every 90 days, audit logs, immediate revocation UI |

---

## Next Steps

1. ✅ Create plan file with phases
2. Start Phase 1: Cookie attribution system
3. Run `pnpm run typecheck` for baseline quality
4. Create feature flags: `ENABLE_COOKIE_ATTRIBUTION`, `ENABLE_REAL_TIME_COMMISSIONS`
5. Deploy to staging for partner pilot testing
6. Monitor fraud review dashboard daily for first week

---

**Plan Version**: 1.0  
**Last Updated**: 2025-06-21  
**Related**: Referral Program (migration 024), Payout Scheduler, WebSocket Infrastructure
